// Analyses : creation, execution des etapes REA, sauvegarde sur disque, evenements temps reel.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { callRea, callReaRaw, hasSnapshot, reaBusy, restartRea, isLightMode, ghidraMemGb, ramGb } from './rea.js';
import { openUrlTarget } from './system.js';
import { detectRuntime, extractEmbeddedPck } from './runtime.js';
import { recoverGodot } from './gdre.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const root = path.join(config.dataDir, 'analyses');
const dirOf = (id) => path.join(root, id);
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));

function slug(s) {
  return (s || 'cible').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'cible';
}

// Taille max de fichier acceptee par REA (512 Mo, son plafond) : la valeur par defaut (64 Mo) bloque les gros jeux et applis.
const BIG = 536870912;

// ---------- Definition des etapes par type de cible
function stepsFor(target, options) {
  const s = [];
  if (target.kind === 'web') {
    s.push({ id: 'open', label: 'Ouvrir le site dans un navigateur piloté', special: 'open-url' });
    s.push({ id: 'screenshot', label: "Capture d'écran de la page", tool: 'capture_web_screenshot', args: (c) => ({ cdp_endpoint: c.endpoint, target_id: c.targetId }) });
    s.push({ id: 'page', label: 'Structure de la page (DOM, scripts, ressources, réseau)', tool: 'inspect_web_page',
      args: (c) => ({ cdp_endpoint: c.endpoint, target_id: c.targetId, observation_ms: 4000, include_json_body_shapes: true, include_websocket_shapes: true, include_storage_keys: true }) });
    s.push({ id: 'bundle', label: 'Code JavaScript : routes, API appelées, librairies', tool: 'analyze_web_bundle',
      args: (c) => ({ cdp_endpoint: c.endpoint, target_id: c.targetId, detail: 'summary', fetch_source_maps: true }) });
    return s;
  }
  const exe = target.exe || target.path;
  const appDir = target.exe ? path.dirname(target.exe) : target.path;
  if (target.kind === 'electron') {
    s.push({ id: 'desktop', label: "Identifier la technologie de l'appli", tool: 'inspect_desktop_application', args: () => ({ path: appDir, detail: 'summary' }) });
    if (target.exe) s.push({ id: 'fuses', label: 'Réglages de sécurité Electron (fuses)', tool: 'inspect_electron_fuses', args: () => ({ path: exe }) });
    s.push({ id: 'js', label: "Graphe du code JavaScript de l'appli", tool: 'analyze_javascript_application', args: () => ({ input_path: target.asar, detail: 'summary' }) });
    if (target.exe) s.push({ id: 'imports', label: 'Fonctions Windows utilisées (imports)', tool: 'inspect_pe_imports', args: () => ({ path: exe, max_file_bytes: BIG }) });
    return s;
  }
  // Native Windows
  s.push({ id: 'desktop', label: "Identifier la technologie de l'appli", tool: 'inspect_desktop_application', args: () => ({ path: appDir, detail: 'summary' }) });
  s.push({ id: 'imports', label: 'Fonctions Windows utilisées (imports)', tool: 'inspect_pe_imports', args: () => ({ path: exe, max_file_bytes: BIG }) });
  s.push({ id: 'hardening', label: 'Protections du binaire (ASLR, DEP, CFG...)', tool: 'inspect_binary_hardening', args: () => ({ path: exe, max_file_bytes: BIG }) });
  s.push({ id: 'resources', label: 'Ressources embarquées (icônes, dialogues, textes)', tool: 'inspect_pe_resources', args: () => ({ path: exe, max_file_bytes: BIG }) });
  // Outils adaptes au type de programme (jeux Godot/Unity, .NET...) a la place de Ghidra.
  const rt = target.runtime;
  const f = rt?.files || {};
  if (rt?.id === 'godot') {
    s.push({ id: 'pck-file', label: 'Isoler le paquet du jeu Godot (.pck)', run: async (ctx, meta) => {
      if (f.pck && !f.embedded) { ctx.pck = f.pck; return `Paquet trouvé : ${path.basename(f.pck)}`; }
      ctx.pck = await extractEmbeddedPck(f.exe, f.embedded, path.join(dirOf(meta.id), 'paquet-godot.pck'));
      return `Paquet extrait du .exe (${Math.round(f.embedded.size / 1048576)} Mo)`;
    } });
    s.push({ id: 'pck-open', label: 'Ouvrir le paquet du jeu', tool: 'open_binary', args: (c) => ({ path: c.pck, provider_id: 'auto' }) });
    s.push({ id: 'pck-inventory', label: 'Contenu du paquet : scripts, scènes, ressources', tool: 'inspect_artifact', args: () => ({ detail: 'summary', integrity_policy: 'record-and-continue' }) });
    if (options.gdre) {
      s.push({ id: 'gdre', label: 'Récupérer les scripts du jeu (GDRE Tools)', run: async (ctx, meta, step) => {
        const out = path.join(dirOf(meta.id), 'jeu-recupere');
        const r = await recoverGodot(f.exe || f.pck, out, { onStatus: (m) => { step.progress = { message: m }; emit(meta, { progress: true }); } });
        writeJson(path.join(dirOf(meta.id), 'steps', 'gdre.json'), { tool: 'gdre_tools', ok: true, data: { dossier: out, scripts_gd: r.gd, scenes: r.scenes, fichiers: r.total, liste_scripts: r.scripts, journal: r.log } });
        return `${r.gd} scripts GDScript et ${r.scenes} scènes récupérés (${r.total} fichiers) dans le dossier jeu-recupere`;
      } });
    }
  } else if (rt?.id === 'unity-il2cpp') {
    s.push({ id: 'il2cpp', label: 'Classes et méthodes du jeu (métadonnées IL2CPP)', tool: 'inspect_il2cpp_metadata',
      args: () => ({ path: f.metadata, binary_path: f.gameAssembly, binary_architecture: 'amd64', detail: 'summary' }) });
  } else if (rt?.id === 'unity-mono' || rt?.id === 'dotnet') {
    s.push({ id: 'managed', label: rt.id === 'dotnet' ? 'Code .NET : classes, méthodes, références' : 'Code C# du jeu (Assembly-CSharp.dll)', tool: 'inspect_managed_artifact', args: () => ({ path: f.managed, detail: 'summary' }) });
    if (f.managed2) s.push({ id: 'managed2', label: 'Code C# complémentaire (firstpass)', tool: 'inspect_managed_artifact', args: () => ({ path: f.managed2, detail: 'summary' }) });
  }
  const ghidraOk = !rt || rt.ghidraUseful || options.forceGhidra;
  if (options.deep && ghidraOk) {
    s.push({ id: 'open', label: 'Préparer le binaire pour Ghidra', ghidra: true, tool: 'open_binary', args: () => ({ path: exe, provider_id: 'auto' }) });
    s.push({ id: 'overview', label: "Vue d'ensemble du binaire (étape longue)", ghidra: true, tool: 'binary_overview', args: () => ({}) });
    s.push({ id: 'procedures', label: 'Liste des fonctions', ghidra: true, tool: 'list_procedures', args: () => ({ detail: 'summary' }) });
    s.push({ id: 'strings', label: 'Textes trouvés dans le binaire', ghidra: true, tool: 'list_strings', args: () => ({ detail: 'summary' }) });
  }
  return s;
}

// ---------- Stockage
// Au demarrage : les analyses restees "en cours" ont ete interrompues par la fermeture de FREE.
export function markInterrupted() {
  for (const m of listAnalyses()) {
    if (m.status !== 'running' && m.status !== 'queued') continue;
    for (const s of m.steps) if (['running', 'waiting', 'pending'].includes(s.status)) { s.status = 'error'; s.error = 'Interrompue : FREE a été fermé pendant l\'analyse. Utilisez « Relancer l\'analyse ».'; delete s.waiting; }
    m.status = 'error';
    save(m);
  }
}

export function listAnalyses() {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((id) => readJson(path.join(dirOf(id), 'meta.json')))
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAnalysis(id) {
  const meta = readJson(path.join(dirOf(id), 'meta.json'));
  if (!meta) return null;
  const dir = dirOf(id);
  return {
    ...meta,
    dir,
    hasPlan: fs.existsSync(path.join(dir, 'PLAN.md')),
    plan: fs.existsSync(path.join(dir, 'PLAN.md')) ? fs.readFileSync(path.join(dir, 'PLAN.md'), 'utf8') : null,
    enquetes: listEnquetes(id),
  };
}

// ---------- Enquetes : une fiche par question, dans enquetes/<id>/ (ENQUETE.md + meta.json)
export function enqueteDir(id, eid) { return path.join(dirOf(id), 'enquetes', eid); }
export function createEnquete(id, question) {
  const q = String(question || '').trim();
  const eid = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${q ? slug(q).slice(0, 30) : 'generale'}`;
  fs.mkdirSync(enqueteDir(id, eid), { recursive: true });
  const meta = { id: eid, question: q, title: q || 'Vue générale de l\'appli', createdAt: new Date().toISOString() };
  writeJson(path.join(enqueteDir(id, eid), 'meta.json'), meta);
  return meta;
}
export function listEnquetes(id) {
  const out = [];
  const base = path.join(dirOf(id), 'enquetes');
  if (fs.existsSync(base)) {
    for (const eid of fs.readdirSync(base)) {
      const m = readJson(path.join(base, eid, 'meta.json'));
      if (!m) continue;
      const f = path.join(base, eid, 'ENQUETE.md');
      out.push({ ...m, md: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null });
    }
  }
  // Ancienne enquete unique (avant les onglets) : affichee comme une fiche.
  const legacy = path.join(dirOf(id), 'ENQUETE.md');
  if (fs.existsSync(legacy)) out.push({ id: 'ancienne', question: '', title: 'Vue générale de l\'appli', createdAt: fs.statSync(legacy).mtime.toISOString(), md: fs.readFileSync(legacy, 'utf8'), legacy: true });
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function deleteEnquete(id, eid) {
  if (!/^[\w-]+$/.test(eid)) return;
  if (eid === 'ancienne') fs.rmSync(path.join(dirOf(id), 'ENQUETE.md'), { force: true });
  else fs.rmSync(enqueteDir(id, eid), { recursive: true, force: true });
  fs.rmSync(path.join(dirOf(id), `claude-enquete-${eid}.log.jsonl`), { force: true });
}

export function getStepResult(id, stepId) {
  return readJson(path.join(dirOf(id), 'steps', `${stepId}.json`));
}

function save(meta) { writeJson(path.join(dirOf(meta.id), 'meta.json'), meta); }
function emit(meta, extra = {}) { bus.emit('event', { type: 'analysis', id: meta.id, meta, ...extra }); }

// ---------- Estimation des durees (en secondes : [min, max]) selon le type d'etape et la taille du fichier
function sizeOf(p) {
  try {
    const st = fs.statSync(p);
    if (st.isFile()) return st.size;
    // Dossier (app.asar extrait) : somme rapide, bornee
    let total = 0, n = 0;
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (++n > 20000) return; const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else total += fs.statSync(f).size; } };
    walk(p);
    return total;
  } catch { return null; }
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function estimate(target, def) {
  const mb = (target.bytes || 0) / 1048576;
  const jsMb = (target.asarBytes || 0) / 1048576;
  switch (def.id) {
    case 'open': return target.kind === 'web' ? [5, 20] : [1, 10];
    case 'screenshot': return [2, 10];
    case 'page': return [10, 40];
    case 'bundle': return [30, 300];
    case 'js': return [Math.round(clamp(30 + jsMb * 3, 30, 600)), Math.round(clamp(120 + jsMb * 12, 120, 2700))];
    case 'overview': return [Math.round(clamp(120 + mb * 6, 180, 1800)), Math.round(clamp(300 + mb * 18, 600, 2700))];
    case 'procedures': case 'strings': return [10, 180];
    case 'pck-file': return [2, 30];
    case 'pck-inventory': case 'il2cpp': case 'managed': case 'managed2': return [5, 120];
    case 'gdre': return [60, 900];
    default: return [1, 15];
  }
}

export function createAnalysis(target, options = {}) {
  const stamp = new Date().toISOString();
  const id = `${stamp.slice(0, 19).replace(/[-:T]/g, '')}-${slug(target.name || target.url)}`;
  if (target.kind !== 'web') {
    target.bytes = sizeOf(target.exe || target.path);
    if (target.asar) target.asarBytes = sizeOf(target.asar);
  }
  if (target.kind === 'native') target.runtime = detectRuntime(target.exe || target.path);
  const steps = stepsFor(target, options).map((def) => ({ id: def.id, label: def.label, tool: def.tool || null, status: 'pending', est: estimate(target, def) }));
  const meta = { id, createdAt: stamp, target, options, status: 'queued', steps };
  fs.mkdirSync(path.join(dirOf(id), 'steps'), { recursive: true });
  save(meta);
  runAnalysis(meta).catch(() => {});
  return meta;
}

// Relance la meme analyse, sur la meme page : etapes remises a zero, plan / enquete / projets conserves.
export function rerunAnalysis(id, extra = {}) {
  const meta = readJson(path.join(dirOf(id), 'meta.json'));
  if (!meta) throw new Error('Analyse introuvable');
  if (meta.status === 'running' || meta.status === 'queued') throw new Error("L'analyse est déjà en cours.");
  const { bytes, asarBytes, ...target } = meta.target;
  if (target.kind !== 'web') {
    target.bytes = sizeOf(target.exe || target.path);
    if (target.asar) target.asarBytes = sizeOf(target.asar);
  }
  if (target.kind === 'native') target.runtime = detectRuntime(target.exe || target.path);
  meta.options = { ...(meta.options || {}), ...(extra.forceGhidra ? { forceGhidra: true, deep: true } : {}), ...(extra.gdre ? { gdre: true } : {}) };
  const dir = dirOf(id);
  fs.rmSync(path.join(dir, 'steps'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'steps'), { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) fs.rmSync(path.join(dir, f), { force: true });
  meta.target = target;
  meta.steps = stepsFor(target, meta.options || {}).map((def) => ({ id: def.id, label: def.label, tool: def.tool || null, status: 'pending', est: estimate(target, def) }));
  meta.status = 'queued';
  meta.rerunAt = new Date().toISOString();
  (meta.runs ||= []).push(meta.rerunAt);
  delete meta.finishedAt;
  save(meta);
  runAnalysis(meta).catch(() => {});
  return meta;
}

async function runAnalysis(meta) {
  const defs = stepsFor(meta.target, meta.options);
  const ctx = {};
  meta.status = 'running';
  save(meta); emit(meta);
  let ghidraFailed = null;
  let lightRetried = false;
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const step = meta.steps.find((x) => x.id === def.id);
    // Si Ghidra n'a pas reussi a demarrer, inutile de relancer un import complet pour chaque etape.
    if (def.ghidra && ghidraFailed) {
      step.status = 'skipped';
      step.summary = 'Ignorée : Ghidra n\'a pas pu analyser le binaire (voir l\'étape précédente).';
      save(meta); emit(meta);
      continue;
    }
    step.status = 'running';
    step.startedAt = Date.now();
    save(meta); emit(meta);
    try {
      if (def.run) {
        step.summary = await def.run(ctx, meta, step);
        step.status = 'done';
      } else if (def.special === 'open-url') {
        Object.assign(ctx, await openUrlTarget(meta.target.url));
        step.summary = `Onglet ouvert (cible ${ctx.targetId.slice(0, 8)}...)`;
        step.status = 'done';
      } else {
        const args = def.args(ctx);
        step.args = args;
        const onProgress = (p) => { step.progress = p; emit(meta, { progress: true }); };
        // Tant que REA est occupe par une autre operation, l'etape est "en attente" (le chrono ne tourne pas).
        let started = false;
        const onStart = () => { started = true; step.status = 'running'; step.startedAt = Date.now(); delete step.waiting; save(meta); emit(meta); };
        const label = meta.target.name || meta.target.url;
        setTimeout(() => {
          const b = reaBusy();
          if (!started && b) { step.status = 'waiting'; step.waiting = b.label ? `REA est occupé par l'analyse « ${b.label} » (${b.tool}). Cette étape démarrera ensuite.` : `REA est occupé (${b.tool}). Cette étape démarrera ensuite.`; save(meta); emit(meta); }
        }, 300);
        // Avant d'ouvrir Ghidra : temps maximum choisi pour cette analyse.
        const ghidraMin = Number(meta.options?.ghidraMin) || config.ghidraTimeoutMin;
        if (def.id === 'open' && def.ghidra) {
          await callRea('update_analysis_settings', { changes: [{ setting: 'ghidra.startup_timeout_ms', action: 'set', value: ghidraMin * 60000 }] }).catch(() => {});
        }
        const timeoutMs = def.ghidra ? (ghidraMin + 15) * 60000 : undefined;
        if (def.id === 'open' && def.ghidra && hasSnapshot(args.path)) step.note = 'Sauvegarde Ghidra trouvée : les résultats déjà calculés seront rechargés.';
        let res = await callRea(def.tool, args, { onProgress, timeoutMs, onStart, label });
        const retry = !res.ok && raisedArgs(res, args);
        if (retry) { step.args = retry; res = await callRea(def.tool, retry, { onProgress, timeoutMs, label }); }
        const file = path.join(dirOf(meta.id), 'steps', `${def.id}.json`);
        writeJson(file, { tool: def.tool, args: step.args, ok: res.ok, data: res.data, text: res.text });
        res.images.forEach((img, i) => {
          const name = `${def.id}${i ? '-' + i : ''}.png`;
          fs.writeFileSync(path.join(dirOf(meta.id), name), Buffer.from(img.data, 'base64'));
          (step.images ||= []).push(name);
        });
        step.bytes = fs.statSync(file).size;
        step.summary = summarize(res);
        step.status = res.ok ? 'done' : 'error';
        if (!res.ok) step.error = errorText(res);
        // Limite connue de REA sur certains .exe (jeux Godot/Unity...) : pas une vraie erreur.
        if (!res.ok && def.tool === 'inspect_pe_resources' && /overlap/i.test(step.error)) {
          step.status = 'skipped';
          step.summary = 'Non lisible pour ce fichier (ressources atypiques, fréquent avec les jeux). Sans impact sur le reste.';
          delete step.error;
        }
      }
    } catch (e) {
      step.status = 'error';
      step.error = e.message;
    }
    // Ghidra a manque de memoire : on relance REA en mode allege et on reprend les etapes Ghidra depuis le debut.
    if (def.ghidra && step.status === 'error' && /OutOfMemoryError|heap space|GC overhead/i.test(step.error || '') && !lightRetried && !isLightMode()) {
      lightRetried = true;
      const before = ghidraMemGb();
      try {
        await restartRea({ light: true });
        const first = defs.findIndex((d) => d.ghidra);
        for (let k = first; k <= i; k++) {
          const st = meta.steps.find((x) => x.id === defs[k].id);
          if (!defs[k].ghidra) continue;
          if (k === i) st.firstError = st.error;
          st.status = 'pending'; delete st.error; delete st.summary; delete st.durationMs; delete st.startedAt;
        }
        step.note = `Ghidra a manqué de mémoire avec ${before} Go. Nouvel essai automatique en mode allégé : ${ghidraMemGb()} Go sur ${ramGb()} Go de RAM, et les analyses Ghidra les plus gourmandes désactivées (résultat un peu moins détaillé).`;
        save(meta); emit(meta);
        i = first - 1;
        continue;
      } catch (e) { step.error += `\n(Nouvel essai en mode allégé impossible : ${e.message})`; }
    }
    if (def.ghidra && step.status === 'error' && /ghidra|startup|deadline|memory/i.test(step.error || '')) ghidraFailed = step.id;
    step.durationMs = Date.now() - step.startedAt;
    delete step.progress;
    save(meta); emit(meta);
    if (def.special === 'open-url' && step.status === 'error') break;
  }
  meta.status = meta.steps.some((s) => s.status === 'done') ? 'done' : 'error';
  meta.finishedAt = new Date().toISOString();
  writeDigest(meta);
  save(meta); emit(meta);
  await exportEvidence(meta.id);
  bus.emit('analysis-finished', meta);
}

function errorText(res) {
  const d = res.data;
  const e = d?.error && typeof d.error === 'object' ? d.error : d;
  const msg = e?.message || (typeof d?.error === 'string' ? d.error : null) || res.text || 'Erreur REA';
  // Le vrai motif est souvent dans details.issues (le message general reste vague).
  const issues = (e?.details?.issues || []).map((i) => i.message).filter(Boolean);
  const why = issues.length ? `\nMotif : ${issues.join(' ; ')}` : '';
  const fix = e?.remediation?.action && !issues.length ? `\nPiste : ${e.remediation.action}` : '';
  return (String(msg) + why + fix).slice(0, 800);
}

// REA refuse parfois un fichier trop gros pour ses limites par defaut (resource_constraint).
// On relance une fois en multipliant la limite concernee (max_<boundary>) par 8.
function raisedArgs(res, args) {
  const e = res.data?.error;
  const lim = e?.details?.reported_limits;
  const msg = String(e?.message || res.text || '');
  const tooBig = msg.match(/exceeds (\d+) bytes/);
  if (tooBig && (args.max_file_bytes ?? 0) < BIG) return { ...args, max_file_bytes: BIG };
  if (e?.code !== 'resource_constraint' || !lim?.boundary || !lim.maximum) return null;
  const key = `max_${lim.boundary}`.replace(/-/g, '_');
  return { ...args, [key]: Math.min(lim.maximum * 8, 536870912) };
}

// Resume court et lisible d'un resultat REA (compte des elements principaux).
function summarize(res) {
  const root = res.data;
  if (!root || typeof root !== 'object') return (res.text || '').slice(0, 200);
  if (!res.ok) return '';
  const d = root.normalized_result && typeof root.normalized_result === 'object' ? root.normalized_result : root;
  const skip = /^(limitations|unknowns|warnings|issues|locations|evidence_links|parameters|subject|provider|args)$/i;
  const parts = [];
  const visit = (node, depth) => {
    if (!node || typeof node !== 'object' || depth > 3 || parts.length >= 5) return;
    for (const [k, v] of Object.entries(node)) {
      if (skip.test(k)) continue;
      const label = k.replace(/_/g, ' ');
      if (Array.isArray(v)) { if (v.length) parts.push(`${v.length} ${label}`); }
      else if (typeof v === 'number' && /count|total|imports|functions|procedures|strings|entries|routes|nodes|edges/i.test(k)) parts.push(`${label} : ${v}`);
      else if (v && typeof v === 'object') visit(v, depth + 1);
      if (parts.length >= 5) return;
    }
  };
  visit(d, 0);
  if (d.coverage?.status) parts.push(`couverture : ${d.coverage.status}`);
  return parts.join(' · ') || 'Résultat reçu';
}

// Toutes les preuves REA de la session dans un fichier JSON reutilisable (import_evidence_bundle).
export async function exportEvidence(id) {
  const file = path.join(dirOf(id), 'preuves-rea.json');
  const r = await callReaRaw('export_evidence_bundle', { path: file, overwrite: true }).catch(() => null);
  return r && !r.isError ? file : null;
}

// Fichier condense lu par Claude Code (chaque etape tronquee pour rester lisible).
export function writeDigest(meta) {
  const dir = dirOf(meta.id);
  const t = meta.target;
  let md = `# Analyse REA : ${t.name || t.url}\n\n`;
  md += `- Type : ${t.kind}${t.runtime ? ` (${t.runtime.label})` : ''}\n- Cible : ${t.url || t.exe || t.path}\n- Date : ${meta.createdAt}\n\n`;
  md += `Les résultats complets de chaque étape sont dans le dossier steps/ (JSON).\n\n`;
  if (t.runtime && t.runtime.id !== 'native') md += `## Type de programme : ${t.runtime.label}\n\n${t.runtime.why}\n\n${t.runtime.advice}\n\n`;
  if (fs.existsSync(path.join(dir, 'jeu-recupere'))) md += `## Scripts récupérés\n\nLe dossier jeu-recupere/ contient le projet Godot récupéré par GDRE Tools (scripts .gd lisibles, scènes .tscn, ressources). C'est la meilleure source pour comprendre la logique du jeu.\n\n`;
  for (const s of meta.steps) {
    md += `## ${s.label}\n\nStatut : ${s.status}${s.tool ? ` (outil REA \`${s.tool}\`)` : ''}\n\n`;
    if (s.summary) md += `Resume : ${s.summary}\n\n`;
    if (s.error) md += `Erreur : ${s.error}\n\n`;
    const r = getStepResult(meta.id, s.id);
    if (r) {
      const json = JSON.stringify(r.data ?? r.text, null, 1);
      md += '```json\n' + json.slice(0, 15000) + (json.length > 15000 ? '\n... (tronque, voir steps/' + s.id + '.json)' : '') + '\n```\n\n';
    }
  }
  fs.writeFileSync(path.join(dir, 'resume-analyse.md'), md);
}

export function deleteAnalysis(id) {
  if (!/^[\w-]+$/.test(id)) return;
  fs.rmSync(dirOf(id), { recursive: true, force: true });
}

export { dirOf as analysisDir, slug };
