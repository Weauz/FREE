// Fonctions liees a Windows : applis ouvertes, selecteur de fichier, ouverture de dossier, navigateur.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

function powershell(script, { sta = false, timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
    if (sta) args.push('-STA');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    args.push('-EncodedCommand', encoded);
    execFile('powershell.exe', args, { timeout, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

const LIST_APPS_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
$seen = @{}
$out = foreach ($p in (Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path })) {
  if ($seen.ContainsKey($p.Path)) { continue }
  $seen[$p.Path] = 1
  $dir = Split-Path $p.Path
  $asar = Join-Path $dir 'resources\app.asar'
  $appDir = Join-Path $dir 'resources\app'
  $isElectron = (Test-Path $asar) -or (Test-Path (Join-Path $appDir 'package.json'))
  $icon = $null
  try {
    $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($p.Path)
    $bmp = $ico.ToBitmap()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon = [Convert]::ToBase64String($ms.ToArray())
  } catch {}
  [pscustomobject]@{
    pid = $p.Id
    name = $p.ProcessName
    title = $p.MainWindowTitle
    path = $p.Path
    description = $p.Description
    company = $p.Company
    version = $p.FileVersion
    kind = $(if ($isElectron) { 'electron' } else { 'native' })
    asar = $(if (Test-Path $asar) { $asar } elseif (Test-Path $appDir) { $appDir } else { $null })
    icon = $icon
  }
}
@($out) | ConvertTo-Json -Depth 3 -Compress
`;

export async function listOpenApps() {
  if (!config.isWin) return demoApps();
  const raw = (await powershell(LIST_APPS_PS)).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .filter((a) => a.path && !/\\Windows\\(System32|SystemApps|ImmersiveControlPanel)\\/i.test(a.path))
    .map((a) => ({ ...a, onedrive: /\\OneDrive\b/i.test(a.path) }))
    .sort((a, b) => (a.description || a.name).localeCompare(b.description || b.name));
}

function demoApps() {
  return [
    { pid: 1, name: 'demo-electron', title: 'Appli Electron (démo)', path: '/opt/demo/demo-electron', description: 'Appli Electron de démonstration', company: 'Demo', kind: 'electron', asar: '/opt/demo/resources/app.asar', icon: null },
    { pid: 2, name: 'demo-native', title: 'Appli native (démo)', path: '/opt/demo/demo.exe', description: 'Appli native de démonstration', company: 'Demo', kind: 'native', asar: null, icon: null },
  ];
}

// Analyse un chemin choisi a la main : exe natif, exe Electron, dossier d'appli, .asar.
export function describeFile(p) {
  const st = fs.statSync(p);
  const dir = st.isDirectory() ? p : path.dirname(p);
  const candidates = [
    p.toLowerCase().endsWith('.asar') ? p : null,
    path.join(dir, 'resources', 'app.asar'),
    path.join(dir, 'resources', 'app'),
  ].filter(Boolean);
  const asar = candidates.find((c) => fs.existsSync(c)) || null;
  const exe = st.isFile() && /\.(exe|dll)$/i.test(p) ? p : null;
  return {
    path: p,
    name: path.basename(p),
    kind: asar ? 'electron' : 'native',
    asar,
    exe,
    onedrive: /[\\/]OneDrive\b/i.test(p),
  };
}

export async function pickFile() {
  if (!config.isWin) throw new Error('Sélecteur disponible uniquement sous Windows.');
  const ps = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'Choisir un fichier à analyser'
$d.Filter = 'Executables et applis (*.exe;*.dll;*.asar)|*.exe;*.dll;*.asar|Tous les fichiers (*.*)|*.*'
$f = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($d.ShowDialog($f) -eq 'OK') { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.FileName }
`;
  return (await powershell(ps, { sta: true, timeout: 10 * 60 * 1000 })).trim() || null;
}

export function openFolder(p) {
  if (config.isWin) spawn('explorer.exe', [p], { detached: true, stdio: 'ignore' }).unref();
}

// ---------- Navigateur pilote par CDP (pour l'analyse de sites web)
function findBrowser() {
  if (!config.isWin) return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((b) => fs.existsSync(b)) || null;
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const lad = process.env.LOCALAPPDATA || '';
  const list = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(lad, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ];
  return list.find((b) => fs.existsSync(b)) || null;
}

const cdpBase = () => `http://127.0.0.1:${config.cdpPort}`;

async function cdpReady() {
  try { const r = await fetch(`${cdpBase()}/json/version`); return r.ok; } catch { return false; }
}

export async function ensureBrowser() {
  if (await cdpReady()) return cdpBase();
  const exe = findBrowser();
  if (!exe) throw new Error('Ni Chrome ni Edge trouvé pour analyser le site.');
  const profile = path.join(config.dataDir, 'browser-profile');
  fs.mkdirSync(profile, { recursive: true });
  const flags = [`--remote-debugging-port=${config.cdpPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'];
  if (!config.isWin && !process.env.DISPLAY) flags.push('--headless=new', '--no-sandbox');
  spawn(exe, [...flags, 'about:blank'],
    { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await cdpReady()) return cdpBase();
  }
  throw new Error("Le navigateur n'a pas ouvert son port de débogage.");
}

// Ouvre l'URL dans un nouvel onglet et renvoie l'id de la cible CDP.
export async function openUrlTarget(url, waitMs = 6000) {
  const endpoint = await ensureBrowser();
  const r = await fetch(`${endpoint}/json/new?${encodeURI(url)}`, { method: 'PUT' });
  if (!r.ok) throw new Error(`Impossible d'ouvrir l'onglet (${r.status}).`);
  const target = await r.json();
  await new Promise((res) => setTimeout(res, waitMs));
  return { endpoint, targetId: target.id };
}

export async function listBrowserTabs() {
  if (!(await cdpReady())) return [];
  const r = await fetch(`${cdpBase()}/json/list`);
  return (await r.json()).filter((t) => t.type === 'page');
}
