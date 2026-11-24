// Lance Claude Code (`claude -p`) en mode non interactif et diffuse son activite en direct.
import { spawn, execFileSync, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { bus, analysisDir, getAnalysis, slug, createEnquete, enqueteDir } from './analyses.js';
import { MCP_TOKEN, FORBIDDEN_TOOLS } from './mcp-proxy.js';

const running = new Map(); // jobId -> child

// Sous Windows, `claude` peut etre un .exe (installation native) ou un .cmd (npm).
// Un .cmd exige cmd.exe : on passe alors une ligne de commande entierement guillemetee.
let resolved = null;
function resolveClaude() {
  if (resolved) return resolved;
  if (!config.isWin || /[\\/]/.test(config.claudeCommand)) return (resolved = { file: config.claudeCommand, shell: /\.(cmd|bat)$/i.test(config.claudeCommand) });
  try {
    const out = execFileSync('where.exe', [config.claudeCommand], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const exe = out.find((l) => /\.exe$/i.test(l));
    const cmd = out.find((l) => /\.(cmd|bat)$/i.test(l));
    resolved = exe ? { file: exe, shell: false } : cmd ? { file: cmd, shell: true } : null;
  } catch { resolved = null; }
  // Installe mais absent du PATH de cette fenetre (installation recente, PATH non recharge) :
  // on regarde les emplacements habituels de Claude Code.
  if (!resolved) {
    const home = process.env.USERPROFILE || '';
    const candidates = [
      path.join(home, '.local', 'bin', 'claude.exe'),
      path.join(process.env.APPDATA || '', 'npm', 'claude.cmd'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),
      path.join(home, '.claude', 'local', 'claude.cmd'),
    ];
    const found = candidates.find((c) => fs.existsSync(c));
    if (found) resolved = { file: found, shell: /\.cmd$/i.test(found) };
  }
  return resolved;
}

function spawnClaude(args, opts) {
  const r = resolveClaude();
  if (!r) throw new Error('Claude Code introuvable (commande `claude`).');
  if (!r.shell) return spawn(r.file, args, { ...opts, windowsHide: true });
  const q = (a) => `"${String(a).replace(/"/g, '""')}"`;
  const line = [q(r.file), ...args.map(q)].join(' ');
  return spawn(line, [], { ...opts, shell: true, windowsHide: true, windowsVerbatimArguments: true });
}

export function claudeAvailable() {
  return new Promise((resolve) => {
    let child;
    try { child = spawnClaude(['--version'], {}); } catch { resolved = null; return resolve({ ok: false }); }
    let out = '';
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolved = null; resolve({ ok: false }); });
    child.on('close', (code) => { clearTimeout(timer); if (code !== 0) resolved = null; resolve(code === 0 ? { ok: true, version: out.trim() } : { ok: false }); });
  });
}

// ---------- Etat de connexion de Claude Code (« claude auth status » : code 0 si connecte, 1 sinon)
function runCapture(args, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let child;
    try { child = spawnClaude(args, {}); } catch { return resolve({ code: -1, out: '' }); }
    let out = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1, out }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

export async function claudeFullStatus() {
  const v = await claudeAvailable();
  if (!v.ok) return { ok: false, installed: false, loggedIn: false };
  const r = await runCapture(['auth', 'status', '--json']);
  let info = {};
  try { info = JSON.parse(r.out); } catch { /* sortie texte d'une ancienne version */ }
  const loggedIn = r.code === 0 && info.loggedIn !== false;
  return { ok: true, installed: true, version: v.version, loggedIn, email: info.email || info.account?.email || null, method: info.authMethod || null };
}

// Installe Claude Code avec npm (1 a 2 minutes).
export function installClaude() {
  return new Promise((resolve, reject) => {
    exec('npm install --global @anthropic-ai/claude-code --no-audit --no-fund', { windowsHide: true, timeout: 10 * 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolved = null; // nouvelle recherche de la commande claude
      if (err) return reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' ')));
      resolve(stdout);
    });
  });
}

// Ouvre une fenetre ou Claude Code demande la connexion au compte, avec les explications en francais.
export function openClaudeLogin() {
  const r = resolveClaude();
  if (!r) throw new Error("Claude Code n'est pas installé.");
  if (!config.isWin) throw new Error('Connexion guidée disponible sous Windows uniquement.');
  const exe = r.file.replace(/'/g, "''");
  const ps = [
    "$Host.UI.RawUI.WindowTitle = 'Connexion de Claude Code - FREE'",
    "Write-Host ''",
    "Write-Host '  CONNEXION DE CLAUDE CODE A VOTRE COMPTE' -ForegroundColor Cyan",
    "Write-Host ''",
    "Write-Host '  1. Une page va s''ouvrir dans le navigateur : connectez-vous avec votre compte Claude.'",
    "Write-Host '  2. Si un code s''affiche, copiez-le avec son bouton, puis collez-le ici avec un CLIC DROIT,'",
    "Write-Host '     et appuyez sur Entree. (Ctrl+V seul ne marche souvent pas ici.)'",
    "Write-Host '  3. Quand c''est fini, fermez cette fenetre : FREE le verra tout seul.'",
    "Write-Host ''",
    `& '${exe}' auth login`,
    "if ($LASTEXITCODE -eq 0) { Write-Host ''; Write-Host '  Connexion reussie ! Vous pouvez fermer cette fenetre.' -ForegroundColor Green }",
    `else { Write-Host ''; Write-Host '  Si ca n''a pas marche : tapez claude puis Entree, puis /login.' -ForegroundColor Yellow; & '${exe}' }`,
  ].join('; ');
  const encoded = Buffer.from(ps, 'utf16le').toString('base64');
  spawn('cmd.exe', ['/c', 'start', '""', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-EncodedCommand', encoded], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return { opened: true };
}

// Par defaut, on reconstruit le meme TYPE de livrable que la cible : un .exe donne un .exe, un site donne un site.
// Les consignes de l'utilisateur passent avant.
function deliverableRule(t) {
  if (t.kind === 'web') return "un site web (pages HTML/CSS/JS ou framework web), qui se lance localement dans le navigateur";
  return "une application de bureau Windows, livree sous forme de .exe : choisis une techno qui produit un executable Windows (Electron + electron-builder, Tauri, .NET...)" +
    (t.kind === 'electron' ? " ; l'appli d'origine est une appli Electron, Electron est donc un choix naturel" : '') +
    ", et prevois un script de build qui genere le .exe (portable ou installeur)";
}

const PLAN_PROMPT = (meta) => `Tu travailles dans le dossier d'une analyse de rétro-ingénierie faite avec REA.
Cible analysee : ${meta.target.name || meta.target.url} (type : ${meta.target.kind}).

1. Lis resume-analyse.md et toutes les enquetes : enquetes/*/ENQUETE.md (et ENQUETE.md s'il existe) ; ce sont les sources les plus riches, chacune explique une fonctionnalite. Puis les fichiers steps/*.json utiles (ils peuvent être gros : utilise Grep et lis par morceaux). Si le dossier jeu-recupere/ existe (scripts d'un jeu Godot récupérés), lis ses scripts .gd principaux : c'est la vraie logique du jeu. Sers-t'en pour comprendre les mécanismes, sans recopier leur code, leurs textes ni leurs images.
2. Écris un fichier PLAN.md en français avec ces sections :
   - Ce que fait l'appli (fonctionnalités observées, avec la preuve : quel fichier/etape)
   - Architecture deduite (technologies, structure, flux de données, API/endpoints, stockage)
   - Ce qui reste inconnu ou incertain
   - Type de livrable et stack : PAR DEFAUT, le meme type de livrable que l'original, c'est-a-dire ${deliverableRule(meta.target)}. Ne change de type que si les consignes de l'utilisateur le demandent explicitement.
   - Stack recommandee pour une version originale (simple, moderne), coherente avec ce type de livrable
   - Plan de reconstruction étape par étape (ecrans, composants, données, API a créer)
   - Criteres de reussite vérifiables
3. La reconstruction doit être une version originale inspiree du fonctionnement : ne prevois pas de copier le code, les textes, les images, le logo ni la marque d'origine.
Ne modifie aucun autre fichier.${meta.extraInstructions ? `\n\nConsignes supplementaires de l'utilisateur : ${meta.extraInstructions}` : ''}`;

const BUILD_PROMPT = (meta, extra) => `Tu reconstruis une application a partir d'une analyse de retro-ingenierie.
Lis PLAN.md (le plan valide) et resume-analyse.md (les preuves) dans ce dossier.
Implemente le projet ici meme, en suivant le plan etape par etape :
- code propre et commente, un README.md qui explique comment lancer le projet sous Windows ;
- version originale : n'utilise ni le code, ni les textes, ni les images, ni la marque de l'appli analysee ;
- livrable : celui que prevoit PLAN.md (par defaut le meme type que l'original : ${deliverableRule(meta.target)}) ;${meta.target.kind !== 'web' ? `
- s'il s'agit d'un .exe : ajoute un script npm (ou equivalent) qui genere le .exe, lance-le, et indique dans le bilan le chemin du .exe produit ;` : ''}
- installe les dependances et verifie que le projet demarre (build ou tests) avant de terminer ;
- termine par un court bilan : ce qui marche, ce qui reste a faire.${extra ? `\n\nConsignes supplementaires : ${extra}` : ''}`;

function runClaude({ jobId, cwd, prompt, allowedTools, analysisId, kind, resume = null, append = false, userText = null, project = null, onSession = null, extraArgs = [], env = {} }) {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', allowedTools.join(','), ...extraArgs];
  if (resume) args.push('--resume', resume);
  const child = spawnClaude(args, { cwd, env: { ...process.env, ...env } });
  running.set(jobId, child);
  const logFile = path.join(analysisDir(analysisId), `claude-${kind}.log.jsonl`);
  const log = fs.createWriteStream(logFile, { flags: append ? 'a' : 'w' });
  const send = (entry) => {
    if (project) entry.project = project;
    entry.ts = Date.now();
    log.write(JSON.stringify(entry) + '\n');
    bus.emit('event', { type: 'claude', jobId, analysisId, kind, entry });
  };
  if (userText) send({ t: 'user', text: userText });
  else send({ t: 'start', cwd });
  child.stdin.write(prompt);
  child.stdin.end();
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (m.type === 'system' && m.subtype === 'init' && m.session_id && onSession) onSession(m.session_id);
        for (const e of toEntries(m)) send(e);
      }
      catch { send({ t: 'text', text: line }); }
    }
  });
  child.stderr.on('data', (c) => send({ t: 'stderr', text: c.toString() }));
  child.on('error', (e) => send({ t: 'error', text: `Impossible de lancer Claude Code : ${e.message}` }));
  child.on('close', (code) => {
    running.delete(jobId);
    send({ t: 'end', code });
    log.end();
    bus.emit('claude-finished', { analysisId, kind, code });
  });
}

// Convertit un message stream-json de Claude Code en entrees lisibles.
function toEntries(m) {
  const out = [];
  if (m.type === 'system' && m.subtype === 'init') out.push({ t: 'info', text: `Session Claude Code démarrée (${m.model || 'modèle par défaut'})` });
  if (m.type === 'assistant') {
    for (const b of m.message?.content || []) {
      if (b.type === 'text' && b.text.trim()) out.push({ t: 'text', text: b.text });
      if (b.type === 'tool_use') out.push({ t: 'tool', name: b.name, detail: toolDetail(b.name, b.input) });
    }
  }
  if (m.type === 'result') out.push({ t: 'result', ok: !m.is_error, text: m.result || '', cost: m.total_cost_usd, turns: m.num_turns, durationMs: m.duration_ms });
  return out;
}

function toolDetail(name, input = {}) {
  return input.file_path || input.path || input.pattern || input.command || input.description || '';
}

export function startPlan(analysisId, extraInstructions = '') {
  const meta = getAnalysis(analysisId);
  if (!meta) throw new Error('Analyse introuvable');
  const jobId = `${analysisId}:plan`;
  if (running.has(jobId)) throw new Error('Le plan est déjà en cours de generation.');
  runClaude({
    jobId, analysisId, kind: 'plan', cwd: analysisDir(analysisId),
    prompt: PLAN_PROMPT({ ...meta, extraInstructions }),
    allowedTools: ['Read', 'Glob', 'Grep', 'Write'],
  });
  return { jobId };
}

export function startBuild(analysisId, { projectName, instructions } = {}) {
  const meta = getAnalysis(analysisId);
  if (!meta?.plan) throw new Error("Générez et validez d'abord le plan.");
  const name = slug(projectName || meta.target.name || 'projet');
  let dir = path.join(config.projectsDir, name);
  for (let n = 2; fs.existsSync(dir) && fs.readdirSync(dir).length; n++) dir = path.join(config.projectsDir, `${name}-${n}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(path.join(analysisDir(analysisId), 'PLAN.md'), path.join(dir, 'PLAN.md'));
  fs.copyFileSync(path.join(analysisDir(analysisId), 'resume-analyse.md'), path.join(dir, 'resume-analyse.md'));
  const jobId = `${analysisId}:build`;
  if (running.has(jobId)) throw new Error('Une reconstruction est déjà en cours.');
  const metaFile = path.join(analysisDir(analysisId), 'meta.json');
  const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  (m.projects ||= []).push({ dir, createdAt: new Date().toISOString() });
  fs.writeFileSync(metaFile, JSON.stringify(m, null, 2));
  runClaude({
    jobId, analysisId, kind: 'build', cwd: dir,
    prompt: BUILD_PROMPT(meta, instructions),
    allowedTools: BUILD_TOOLS,
    onSession: (sid) => saveProjectSession(analysisId, dir, sid),
  });
  return { jobId, dir };
}

const BUILD_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite', 'Bash(npm:*)', 'Bash(npx:*)', 'Bash(node:*)', 'Bash(pnpm:*)', 'Bash(git:*)', 'Bash(python:*)', 'Bash(pip:*)', 'Bash(dir:*)', 'Bash(ls:*)', 'Bash(mkdir:*)'];

function saveProjectSession(analysisId, dir, sessionId) {
  const metaFile = path.join(analysisDir(analysisId), 'meta.json');
  const m = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  const p = (m.projects || []).find((x) => x.dir === dir);
  if (p) { p.sessionId = sessionId; fs.writeFileSync(metaFile, JSON.stringify(m, null, 2)); }
}

const CHANGE_PROMPT = (text) => `Demande de l'utilisateur pour ce projet :
<<<
${text}
>>>

Contexte : ce projet est une reconstruction originale ; PLAN.md et resume-analyse.md decrivent l'appli analysee.
- Si c'est une question, reponds clairement en francais (tu peux lire le code pour repondre).
- Si c'est une modification (theme, nouvelle fonctionnalite, correction...), fais-la proprement, mets a jour le README si besoin, puis verifie que le projet build ou demarre toujours.
- Garde la reconstruction originale : pas de code, textes, images ni marque de l'appli d'origine.
- Termine par un court resume en francais de ce que tu as fait et comment le voir.`;

// Demande libre sur un projet reconstruit : la conversation Claude Code continue d'un message a l'autre.
export function startChange(analysisId, { projectDir, message } = {}) {
  const meta = getAnalysis(analysisId);
  const proj = (meta?.projects || []).find((p) => p.dir === projectDir) || (meta?.projects || []).at(-1);
  if (!proj) throw new Error("Reconstruisez d'abord le projet (étape 3).");
  if (!fs.existsSync(proj.dir)) throw new Error(`Dossier du projet introuvable : ${proj.dir}`);
  const text = String(message || '').trim();
  if (!text) throw new Error('Écrivez ce que vous voulez changer.');
  const jobId = `${analysisId}:change`;
  if (running.has(jobId) || running.has(`${analysisId}:build`)) throw new Error('Claude Code travaille déjà sur ce projet, attendez la fin.');
  runClaude({
    jobId, analysisId, kind: 'change', cwd: proj.dir, append: true, userText: text, project: proj.dir,
    prompt: CHANGE_PROMPT(text),
    allowedTools: BUILD_TOOLS,
    resume: proj.sessionId || null,
    onSession: (sid) => saveProjectSession(analysisId, proj.dir, sid),
  });
  return { jobId, dir: proj.dir };
}

// ---------- Enquete approfondie : Claude Code pilote lui-meme les outils REA
// Outils qui executent la cible, la modifient ou agissent sur un appareil : interdits ici.
const REA_FORBIDDEN = [...FORBIDDEN_TOOLS].map((t) => `mcp__rea__${t}`);

const DEEP_PROMPT = (meta, focus, eid) => {
  const t = meta.target;
  const DIR = analysisDir(meta.id);
  const out = `enquetes/${eid}/ENQUETE.md`;
  const where = t.kind === 'web'
    ? `Site : ${t.url}. Un navigateur pilote tourne avec le debogage sur http://127.0.0.1:9333 (utilise list_browser_targets pour retrouver l'onglet ; s'il n'existe plus, dis-le).`
    : `Fichier : ${t.exe || t.path}${t.asar ? `\nCode JavaScript de l'appli : ${t.asar}` : ''}`;
  return `Tu fais une enquete de retro-ingenierie approfondie avec les outils REA (serveur MCP "rea", outils mcp__rea__*).
Cible : ${t.name || t.url} (type : ${t.kind}).
${where}

Une premiere analyse automatique est deja faite : lis resume-analyse.md (et steps/*.json au besoin). Si le dossier jeu-recupere/ existe, il contient les scripts .gd du jeu (Godot) : cherche-y la fonctionnalité demandée (Grep).
D'autres enquetes ont peut-etre deja ete faites (enquetes/*/ENQUETE.md, ENQUETE.md) : lis-les pour ne pas refaire le meme travail. Si preuves-rea.json existe et que binary_session ne montre pas ces preuves, tu peux les recharger avec import_evidence_bundle (chemin absolu : ${path.join(DIR, 'preuves-rea.json')}).
${focus
  ? `QUESTION DE L'UTILISATEUR : ${focus}\nTa mission : repondre precisement a cette question. Trouve ou et comment cette fonctionnalite est realisee (fichiers, fonctions, donnees, reseau), avec les preuves REA. Reste concentre sur cette question.`
  : `Ta mission : comprendre comment l'appli fonctionne dans son ensemble, au-dela de cette premiere analyse.`}
- Tu partages la session REA de FREE : si le binaire est deja charge dans Ghidra (verifie avec binary_session), ne le rouvre pas, interroge-le directement. Sinon ouvre-le avec open_binary.
- Choisis toi-meme les outils REA utiles (commence par guided_workflows action "list" si tu hesites). Exemples : pour un binaire natif, open_binary puis search_strings, analyze_function, xrefs, get_call_graph ; pour une appli JavaScript/Electron, analyze_javascript_application puis trace_application_feature ; pour un site, analyze_web_bundle, inspect_web_page.
- Les gros resultats sont gardes par REA : lis-les par morceaux avec inspect_analysis_view et le parent_evidence_id.
- Lecture seule : n'execute pas la cible, ne modifie rien en dehors de ce dossier.
- Sois efficace : environ 40 appels d'outils au maximum. Ghidra peut mettre de longues minutes a demarrer sur un gros fichier, c'est normal.
- Ecris tes trouvailles au fur et a mesure dans ${out} (et nulle part ailleurs), en francais simple : commence par une reponse courte en 3 a 5 lignes, puis le detail (comment ca marche, fichiers et fonctions concernes avec l'outil et la preuve, donnees, reseau), et termine par ce qui reste inconnu.
- Termine par un court resume.`;
};

export function startDeep(analysisId, { focus } = {}) {
  const meta = getAnalysis(analysisId);
  if (!meta) throw new Error('Analyse introuvable');
  if (meta.status === 'running' || meta.status === 'queued') throw new Error("Attendez la fin de l'analyse automatique.");
  // Une enquete a la fois par analyse : elles partagent la meme session Ghidra.
  const jobId = `${analysisId}:deep`;
  if (running.has(jobId)) throw new Error('Une enquête est déjà en cours : attendez qu\'elle se termine.');
  const enq = createEnquete(analysisId, focus);
  // Claude Code se branche sur la session REA de FREE (binaire deja charge dans Ghidra = pas de reimport).
  const mcpFile = path.join(analysisDir(analysisId), 'rea-mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { rea: {
    type: 'http', url: `http://127.0.0.1:${config.port}/mcp`, headers: { Authorization: `Bearer ${MCP_TOKEN}` },
  } } }, null, 2));
  runClaude({
    jobId, analysisId, kind: `enquete-${enq.id}`, cwd: analysisDir(analysisId),
    prompt: DEEP_PROMPT(meta, enq.question, enq.id),
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'mcp__rea'],
    extraArgs: ['--mcp-config', mcpFile, '--strict-mcp-config', '--disallowedTools', REA_FORBIDDEN.join(',')],
    // Un outil REA peut attendre longtemps (demarrage de Ghidra) : on relache le delai MCP de Claude Code.
    env: { MCP_TOOL_TIMEOUT: String((config.ghidraTimeoutMin + 15) * 60000), MCP_TIMEOUT: '60000' },
  });
  return { jobId, enquete: enq };
}

export function stopJob(jobId) {
  const c = running.get(jobId);
  if (!c) return false;
  if (config.isWin) spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true });
  else c.kill();
  return true;
}

export function jobLog(analysisId, kind) {
  const f = path.join(analysisDir(analysisId), `claude-${kind}.log.jsonl`);
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function isRunning(jobId) { return running.has(jobId); }
export function anyClaudeRunning() { return running.size > 0; }
