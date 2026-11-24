// Client MCP vers REA (`rea mcp` en stdio). Une seule session, appels en file d'attente
// car REA garde un binaire "ouvert" par session.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config, resolveReaLaunch } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

let client = null;
let connecting = null;
let tools = [];
let lastError = null;
let stderrTail = '';
let queue = Promise.resolve();
// Operation REA en cours dans la file (pour afficher "en attente de ..." aux autres analyses).
let busy = null;
export function reaBusy() { return busy; }

// Outils sans etat (ils lisent un fichier ou une page passee en argument) : ils peuvent passer
// a cote de la file et tourner pendant qu'une longue analyse Ghidra occupe REA.
const PARALLEL_OK = new Set(['inspect_desktop_application', 'inspect_pe_imports', 'inspect_pe_resources', 'inspect_pe_certificates',
  'inspect_pe_load_config', 'inspect_binary_hardening', 'inspect_electron_fuses', 'analyze_javascript_application',
  'capture_web_screenshot', 'inspect_web_page', 'analyze_web_bundle', 'list_browser_targets', 'guided_workflows']);

export function reaStatus() {
  return { connected: !!client, toolCount: tools.length, error: lastError, stderr: stderrTail.slice(-2000) };
}

export async function connectRea() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const launch = resolveReaLaunch();
    if (!launch) {
      lastError = "REA introuvable. Installez-le avec : npm install --global rea-agents";
      throw new Error(lastError);
    }
    const env = reaEnv();
    if (!env.REA_ANALYSIS_PROVIDER) env.REA_ANALYSIS_PROVIDER = 'ghidra';
    const transport = new StdioClientTransport({ command: launch.command, args: launch.args, env, stderr: 'pipe' });
    transport.stderr?.on('data', (b) => { stderrTail = (stderrTail + b.toString()).slice(-8000); });
    const c = new Client({ name: 'free', version: '1.0.0' });
    c.onclose = () => { client = null; tools = []; };
    await c.connect(transport);
    const all = [];
    let cursor;
    do {
      const page = await c.listTools(cursor ? { cursor } : {});
      all.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    tools = all;
    client = c;
    lastError = null;
    // Deuxieme filet de securite : on regle aussi le delai de demarrage de Ghidra a chaud
    // (45 min) au cas ou la variable d'environnement n'aurait pas ete prise en compte.
    try {
      await c.callTool({ name: 'update_analysis_settings', arguments: { changes: [
        { setting: 'ghidra.startup_timeout_ms', action: 'set', value: config.ghidraTimeoutMin * 60 * 1000 },
      ] } });
    } catch { /* outil absent ou refuse : la variable d'environnement reste en place */ }
    return c;
  })();
  try { return await connecting; }
  catch (e) { lastError = e.message; throw e; }
  finally { connecting = null; }
}

export async function listReaTools() {
  await connectRea();
  return tools;
}

// ---------- Sauvegardes Ghidra (snapshots REA)
// REA peut enregistrer les reponses deja calculees pour un binaire dans un fichier, au moment ou on le ferme.
// Rouvert avec ce fichier, le meme binaire repond instantanement aux questions deja posees
// (les nouvelles questions relancent Ghidra). Un fichier par binaire, dans data/snapshots.
let currentBinary = null; // chemin du binaire ouvert dans la session REA
const snapDir = path.join(config.dataDir, 'snapshots');
export function snapshotPathFor(binPath) {
  const base = path.basename(binPath).replace(/[^\w.-]+/g, '_').slice(0, 60);
  const h = crypto.createHash('sha1').update(String(binPath).toLowerCase()).digest('hex').slice(0, 10);
  return path.join(snapDir, `${base}-${h}${lightMode ? '-leger' : ''}.rea-snapshot.json`);
}
export function hasSnapshot(binPath) { return !!binPath && fs.existsSync(snapshotPathFor(binPath)); }
export function currentBinaryPath() { return currentBinary; }

// Ferme le binaire ouvert en sauvegardant ce que Ghidra a calcule (avant d'en ouvrir un autre ou de quitter).
export async function closeWithSnapshot() {
  if (!currentBinary) return null;
  fs.mkdirSync(snapDir, { recursive: true });
  const file = snapshotPathFor(currentBinary);
  const res = await callReaRaw('close_binary', { snapshot_path: file, overwrite: true }).catch(() => null);
  if (!res || res.isError) await callReaRaw('close_binary', {}).catch(() => null); // sauvegarde refusee : fermeture simple
  currentBinary = null;
  return res && !res.isError ? file : null;
}

// Appelle un outil REA et renvoie le resultat MCP brut (file d'attente : une operation a la fois).
export function callReaRaw(name, args = {}, { onProgress, timeoutMs, onStart, label } = {}) {
  if (PARALLEL_OK.has(name)) {
    return (async () => {
      const c = await connectRea();
      onStart?.();
      return c.callTool({ name, arguments: args }, undefined, {
        timeout: Math.max(timeoutMs || 0, config.toolTimeoutMs), resetTimeoutOnProgress: true,
        maxTotalTimeout: Math.max(timeoutMs || 0, config.toolTimeoutMs) * 2, onprogress: onProgress,
      });
    })();
  }
  const run = async () => {
    busy = { tool: name, label: label || null, since: Date.now() };
    onStart?.();
    try { return await runQueued(); } finally { busy = null; }
  };
  const runQueued = async () => {
    const c = await connectRea();
    // Changement de binaire (par FREE ou par Claude Code) : on sauvegarde d'abord le precedent.
    if (name === 'open_binary' && currentBinary && args.path && path.resolve(args.path) !== path.resolve(currentBinary)) {
      const prev = currentBinary; currentBinary = null;
      fs.mkdirSync(snapDir, { recursive: true });
      const r = await c.callTool({ name: 'close_binary', arguments: { snapshot_path: snapshotPathFor(prev), overwrite: true } }, undefined, { timeout: 10 * 60000 }).catch(() => null);
      if (!r || r.isError) await c.callTool({ name: 'close_binary', arguments: {} }).catch(() => null);
    }
    // Reouverture d'un binaire deja analyse : on lui redonne sa sauvegarde.
    let callArgs = args;
    if (name === 'open_binary' && args.path && !args.snapshot_path && hasSnapshot(args.path) && !(currentBinary && path.resolve(currentBinary) === path.resolve(args.path))) {
      callArgs = { ...args, snapshot_path: snapshotPathFor(args.path) };
    }
    let res = await c.callTool({ name, arguments: callArgs }, undefined, {
      timeout: Math.max(timeoutMs || 0, config.toolTimeoutMs),
      resetTimeoutOnProgress: true,
      maxTotalTimeout: Math.max(timeoutMs || 0, config.toolTimeoutMs) * 2,
      onprogress: onProgress,
    });
    if (name === 'open_binary' && res.isError && callArgs !== args) {
      // Sauvegarde perimee (binaire mis a jour, autre version de Ghidra...) : on la met de cote et on ouvre normalement.
      try { fs.renameSync(callArgs.snapshot_path, callArgs.snapshot_path + '.ancien'); } catch { /* ignore */ }
      res = await c.callTool({ name, arguments: args }, undefined, { timeout: Math.max(timeoutMs || 0, config.toolTimeoutMs), resetTimeoutOnProgress: true, onprogress: onProgress });
    }
    if (name === 'open_binary' && !res.isError) currentBinary = args.path;
    if (name === 'close_binary' && !res.isError) currentBinary = null;
    return res;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// Appelle un outil REA. Renvoie { ok, data, text, images }.
export async function callRea(name, args = {}, opts = {}) {
  return normalize(await callReaRaw(name, args, opts));
}

function normalize(res) {
  const texts = [];
  const images = [];
  for (const block of res.content || []) {
    if (block.type === 'text') texts.push(block.text);
    else if (block.type === 'image') images.push({ mimeType: block.mimeType, data: block.data });
    else if (block.type === 'resource' && block.resource?.text) texts.push(block.resource.text);
  }
  const text = texts.join('\n');
  let data = res.structuredContent ?? null;
  if (data == null) { try { data = JSON.parse(text); } catch { data = null; } }
  // Certains resultats contiennent un PNG en base64 dans le JSON.
  collectInlinePngs(data, images);
  return { ok: !res.isError, data, text: data == null ? text : '', images };
}

function collectInlinePngs(node, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8 || out.length >= 4) return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && v.length > 200 && v.startsWith('iVBORw0KGgo')) {
      out.push({ mimeType: 'image/png', data: v });
    } else if (v && typeof v === 'object') collectInlinePngs(v, out, depth + 1);
  }
}

// Environnement de lancement de REA (partage avec Claude Code pour l'enquete approfondie).
export function ghidraMemGb() {
  const ram = os.totalmem() / 1073741824;
  // Mode allege : on laisse 3 Go a Windows et on donne le reste a Ghidra (jusqu'a 48 Go).
  if (lightMode) return Math.max(2, Math.min(48, Math.floor(Math.min(ram * 0.8, ram - 3))));
  return Math.max(2, Math.min(32, Math.floor(ram * 0.6)));
}
export function ramGb() { return Math.round(os.totalmem() / 1073741824); }

// Mode allege : apres un manque de memoire, Ghidra est relance avec plus de memoire et sans ses
// analyses les plus gourmandes (le resultat reste exploitable, un peu moins detaille).
const LIGHT_ANALYZERS = ['WindowsResourceReference', 'Decompiler Parameter ID', 'Decompiler Switch Analysis', 'Call Convention ID',
  'Function ID', 'Embedded Media', 'Scalar Operand References', 'Create Address Tables'];
let lightMode = false;
export function isLightMode() { return lightMode; }
export async function restartRea({ light }) {
  lightMode = !!light;
  currentBinary = null;
  await closeRea();
  await connectRea();
}

export function reaEnv() {
  const env = { ...process.env };
  if (!env.REA_ANALYSIS_PROVIDER) env.REA_ANALYSIS_PROVIDER = 'ghidra';
  if (!env.REA_GHIDRA_STARTUP_TIMEOUT_MS) env.REA_GHIDRA_STARTUP_TIMEOUT_MS = String(config.ghidraTimeoutMin * 60 * 1000);
  if (lightMode) env.REA_GHIDRA_DISABLED_ANALYZERS = LIGHT_ANALYZERS.join(',');
  else if (env.REA_GHIDRA_DISABLED_ANALYZERS === undefined) env.REA_GHIDRA_DISABLED_ANALYZERS = 'WindowsResourceReference';
  // Memoire de Ghidra (Java) : par defaut Ghidra en prend peu et plante (OutOfMemoryError) sur les gros .exe.
  // On lui donne environ 60 % de la RAM du PC, entre 2 et 32 Go.
  // (une valeur trop petite laissee dans les variables Windows est ignoree)
  const cur = parseInt(env.GHIDRA_HEADLESS_MAXMEM, 10);
  if (lightMode || !cur || cur < ghidraMemGb()) env.GHIDRA_HEADLESS_MAXMEM = `${ghidraMemGb()}G`;
  return env;
}

export async function closeRea() {
  try { await client?.close(); } catch { /* ignore */ }
  client = null;
}
