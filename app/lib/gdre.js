// GDRE Tools (Godot RE Tools, licence MIT) : recupere les scripts GDScript et les ressources d'un jeu Godot.
// Telecharge depuis GitHub seulement quand l'utilisateur le demande, range dans %LOCALAPPDATA%\FREE\outils\gdre.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from './config.js';

const toolsDir = path.join(path.dirname(config.dataDir), 'outils', 'gdre');

function findExe(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = findExe(p); if (r) return r; }
    else if (/^gdre_tools.*\.exe$/i.test(e.name) && !/console/i.test(e.name)) return p;
  }
  return null;
}

function run(cmd, args, { cwd, timeoutMs, onLine } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    const take = (b) => { const t = b.toString(); out = (out + t).slice(-20000); t.split(/\r?\n/).filter(Boolean).forEach((l) => onLine?.(l)); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    const timer = timeoutMs ? setTimeout(() => { try { p.kill(); } catch { /* ignore */ } }, timeoutMs) : null;
    p.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code, out }); });
    p.on('error', (e) => { if (timer) clearTimeout(timer); resolve({ code: -1, out: e.message }); });
  });
}

export async function ensureGdre(onStatus = () => {}) {
  const existing = findExe(toolsDir);
  if (existing) return existing;
  if (!config.isWin) throw new Error('GDRE Tools n\'est installé automatiquement que sous Windows.');
  onStatus('Recherche de la dernière version de GDRE Tools sur GitHub…');
  const r = await fetch('https://api.github.com/repos/GDRETools/gdsdecomp/releases/latest', {
    headers: { 'User-Agent': 'FREE', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`GitHub injoignable (${r.status}).`);
  const rel = await r.json();
  const asset = (rel.assets || []).find((a) => /windows/i.test(a.name) && /\.zip$/i.test(a.name));
  if (!asset) throw new Error('Version Windows de GDRE Tools introuvable sur GitHub.');
  onStatus(`Téléchargement de GDRE Tools ${rel.tag_name} (${Math.round(asset.size / 1048576)} Mo)…`);
  const dl = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'FREE' }, signal: AbortSignal.timeout(15 * 60000) });
  if (!dl.ok) throw new Error(`Téléchargement impossible (${dl.status}).`);
  const dest = path.join(toolsDir, String(rel.tag_name).replace(/[^\w.-]/g, ''));
  fs.mkdirSync(dest, { recursive: true });
  const zip = path.join(dest, asset.name);
  fs.writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
  onStatus('Décompression…');
  const ps = await run('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { timeoutMs: 10 * 60000 });
  fs.rmSync(zip, { force: true });
  const exe = findExe(dest);
  if (!exe) throw new Error('GDRE Tools téléchargé mais introuvable après décompression. ' + ps.out.slice(-300));
  return exe;
}

function countFiles(dir) {
  const c = { gd: 0, scenes: 0, total: 0, scripts: [] };
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.godot') walk(p); continue; }
      c.total++;
      if (e.name.endsWith('.gd')) { c.gd++; if (c.scripts.length < 400) c.scripts.push(path.relative(dir, p).replace(/\\/g, '/')); }
      if (e.name.endsWith('.tscn')) c.scenes++;
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return c;
}

// Recupere le projet Godot (scripts decompiles + ressources) dans outDir.
export async function recoverGodot(input, outDir, { onStatus = () => {} } = {}) {
  const exe = await ensureGdre(onStatus);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  onStatus('Récupération des scripts et ressources du jeu (quelques minutes)…');
  const res = await run(exe, ['--headless', `--recover=${input}`, `--output=${outDir}`], {
    cwd: path.dirname(exe), timeoutMs: 45 * 60000, onLine: (l) => { if (l.length < 200) onStatus(l); },
  });
  const counts = countFiles(outDir);
  if (!counts.total) throw new Error(`GDRE Tools n'a rien récupéré (code ${res.code}). ${res.out.slice(-500)}`);
  return { ...counts, code: res.code, log: res.out.slice(-4000) };
}
