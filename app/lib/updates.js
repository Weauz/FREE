// Verification des mises a jour de REA (npm) et de Ghidra (GitHub officiel).
// Rien n'est installe sans action de l'utilisateur.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, resolveReaLaunch } from './config.js';

let cache = { checkedAt: null, free: null, rea: null, ghidra: null, error: null };

// Version de FREE et depot GitHub ou sont publiees les nouvelles versions (package.json : "version", "updateRepo").
const PKG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8')); } catch { return {}; }
})();
export const FREE_VERSION = PKG.version || '0.0.0';
const UPDATE_REPO = process.env.FREE_UPDATE_REPO || PKG.updateRepo || '';

// FREE installe par FREE-Installation.exe (mise a jour silencieuse possible) ou simple dossier ?
function installedBySetup() {
  const home = process.env.FREE_HOME;
  return !!(home && fs.existsSync(path.join(home, 'ressources', 'installe.txt')));
}

async function latestFree() {
  const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { 'User-Agent': 'FREE-update-check', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000),
  });
  if (r.status === 404) return null; // aucune version publiee pour l'instant
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => /^FREE-Installation.*\.exe$/i.test(a.name));
  return {
    version: String(rel.tag_name || '').replace(/^v/i, ''),
    url: asset?.browser_download_url || null,
    sizeMb: asset ? Math.max(1, Math.round(asset.size / 1048576)) : null,
    notes: (rel.body || '').slice(0, 1500),
    page: rel.html_url,
  };
}

// Compare deux versions "1.2.3" : >0 si a > b
export function cmpVersion(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function installedRea() {
  const launch = resolveReaLaunch();
  if (!launch) return null;
  const entry = launch.args.find((x) => x.endsWith('rea.mjs'));
  if (!entry) return null;
  try { return JSON.parse(fs.readFileSync(path.join(path.dirname(entry), '..', 'package.json'), 'utf8')).version; } catch { return null; }
}

function installedGhidra() {
  const dir = process.env.GHIDRA_INSTALL_DIR;
  if (!dir) return null;
  try {
    const props = fs.readFileSync(path.join(dir, 'Ghidra', 'application.properties'), 'utf8');
    const m = props.match(/^application\.version=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

async function latestRea() {
  const r = await fetch('https://registry.npmjs.org/rea-agents/latest', { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`npm ${r.status}`);
  return (await r.json()).version;
}

async function latestGhidra() {
  const r = await fetch('https://api.github.com/repos/NationalSecurityAgency/ghidra/releases?per_page=15', {
    headers: { 'User-Agent': 'FREE-update-check', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  let best = null;
  for (const rel of await r.json()) {
    if (rel.draft || rel.prerelease) continue;
    for (const a of rel.assets || []) {
      const m = a.name.match(/^ghidra_(\d+\.\d+(?:\.\d+)?)_PUBLIC_\d+\.zip$/);
      if (m && (!best || cmpVersion(m[1], best.version) > 0)) best = { version: m[1], sizeMb: Math.round(a.size / 1048576) };
    }
  }
  return best;
}

export async function checkUpdates() {
  const out = { checkedAt: new Date().toISOString(), free: null, rea: null, ghidra: null, error: null };
  const errors = [];
  if (UPDATE_REPO) {
    try {
      const rel = await latestFree();
      out.free = { installed: FREE_VERSION, latest: rel?.version || null, notes: rel?.notes || '', sizeMb: rel?.sizeMb || null,
        page: rel?.page || null, auto: installedBySetup(), available: !!(rel?.url && cmpVersion(rel.version, FREE_VERSION) > 0) };
      freeRelease = rel;
    } catch (e) { out.free = { installed: FREE_VERSION, latest: null, available: false }; errors.push(`FREE : ${e.message}`); }
  }
  const reaNow = installedRea();
  try {
    const latest = await latestRea();
    out.rea = { installed: reaNow, latest, available: !!(reaNow && latest && cmpVersion(latest, reaNow) > 0) };
  } catch (e) { out.rea = { installed: reaNow, latest: null, available: false }; errors.push(`REA : ${e.message}`); }
  const gNow = installedGhidra();
  try {
    const best = await latestGhidra();
    out.ghidra = { installed: gNow, latest: best?.version || null, sizeMb: best?.sizeMb || null, available: !!(gNow && best && cmpVersion(best.version, gNow) > 0) };
  } catch (e) { out.ghidra = { installed: gNow, latest: null, available: false }; errors.push(`Ghidra : ${e.message}`); }
  if (errors.length) out.error = `Vérification impossible (${errors.join(' ; ')}). Êtes-vous connecté à Internet ?`;
  cache = out;
  return out;
}

export function updatesStatus() { return cache; }

let freeRelease = null;

// Telecharge la nouvelle version de FREE-Installation.exe et la lance.
// Installe par l'installateur : mise a jour automatique (/maj) puis FREE redemarre tout seul.
// Simple dossier : l'installateur s'ouvre normalement et l'utilisateur choisit.
export async function downloadAndRunFreeUpdate() {
  if (!config.isWin) throw new Error('Mise à jour automatique disponible seulement sous Windows.');
  if (!freeRelease?.url) await checkUpdates();
  const rel = freeRelease;
  if (!rel?.url || cmpVersion(rel.version, FREE_VERSION) <= 0) throw new Error('Aucune nouvelle version de FREE à installer.');
  const r = await fetch(rel.url, { headers: { 'User-Agent': 'FREE-update' }, signal: AbortSignal.timeout(10 * 60000) });
  if (!r.ok) throw new Error(`Téléchargement impossible (GitHub ${r.status}).`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 50000 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error('Le fichier téléchargé n\'est pas un installateur valide.');
  const exe = path.join(os.tmpdir(), `FREE-Installation-${rel.version.replace(/[^0-9a-z.-]/gi, '')}.exe`);
  fs.writeFileSync(exe, buf);
  const auto = installedBySetup();
  spawn(exe, auto ? ['/maj'] : [], { detached: true, stdio: 'ignore', cwd: os.tmpdir() }).unref();
  return { version: rel.version, auto };
}

export function startUpdateChecks() {
  const run = () => checkUpdates().catch(() => {});
  setTimeout(run, 5000); // apres le demarrage, sans le ralentir
  setInterval(run, 6 * 3600 * 1000).unref();
}

// Met REA a jour avec npm (la session REA est ensuite relancee par l'appelant).
export function npmUpdateRea() {
  return new Promise((resolve, reject) => {
    exec('npm install --global rea-agents@latest --no-audit --no-fund', { windowsHide: true, timeout: 10 * 60000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim().split('\n').slice(-3).join(' '))) : resolve(stdout)));
  });
}

// Ouvre l'installateur dans sa propre fenetre (il propose le telechargement de la nouvelle version de Ghidra).
export function launchInstaller() {
  const home = process.env.FREE_HOME;
  const ps1 = home && [path.join(home, 'ressources', 'installation', 'installer-rea.ps1'), path.join(home, 'Installation', 'installer-rea.ps1')].find((f) => fs.existsSync(f));
  if (!ps1) throw new Error("L'installateur est introuvable (dossier ressources\\installation à côté de FREE.exe).");
  if (config.isWin) spawn('cmd.exe', ['/c', 'start', '""', 'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { detached: true, stdio: 'ignore', cwd: home }).unref();
  return ps1;
}
