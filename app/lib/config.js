// Configuration : chemins, ports et commandes. Surchargable par variables d'environnement.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const isWin = process.platform === 'win32';
const home = os.homedir();
const localBase = isWin
  ? path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'FREE')
  : path.join(home, '.free');

export const config = {
  isWin,
  port: Number(process.env.FREE_PORT || 4747),
  dataDir: process.env.FREE_DATA || path.join(localBase, 'data'),
  // Hors OneDrive : REA et les outils de build preferent des dossiers locaux.
  projectsDir: process.env.FREE_PROJECTS || path.join(home, 'REA-Projets'),
  cdpPort: Number(process.env.FREE_CDP_PORT || 9333),
  reaCommand: process.env.FREE_REA_COMMAND || null, // ex: "node C:\\...\\rea.mjs"
  claudeCommand: process.env.FREE_CLAUDE_COMMAND || 'claude',
  // Temps maximum laisse a Ghidra pour importer et analyser un binaire (minutes), modifiable a chaque analyse.
  ghidraTimeoutMin: Number(process.env.FREE_GHIDRA_TIMEOUT_MIN || 120),
  toolTimeoutMs: Number(process.env.FREE_TOOL_TIMEOUT_MS || 60 * 60 * 1000),
};

for (const d of [config.dataDir, config.projectsDir, path.join(config.dataDir, 'analyses')]) {
  fs.mkdirSync(d, { recursive: true });
}

// Trouve le point d'entree de REA (scripts/rea.mjs) installe globalement par npm.
export function resolveReaLaunch() {
  if (config.reaCommand) {
    const parts = config.reaCommand.match(/"[^"]+"|\S+/g).map((s) => s.replace(/^"|"$/g, ''));
    return { command: parts[0], args: [...parts.slice(1), 'mcp'] };
  }
  let root = null;
  try {
    root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch { /* npm absent */ }
  const entry = root && path.join(root, 'rea-agents', 'scripts', 'rea.mjs');
  if (!entry || !fs.existsSync(entry)) return null;
  return { command: process.execPath, args: [entry, 'mcp'] };
}
