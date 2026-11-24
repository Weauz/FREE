// Detection du type de programme AVANT l'analyse, pour choisir les bons outils.
// Ghidra decompile du code machine (C, C++, Rust...). Pour un jeu Godot, Unity, une appli .NET, Java,
// Python... la vraie logique est ailleurs (scripts, bytecode, metadonnees) : Ghidra analyserait
// surtout le moteur ou l'interpreteur, pendant des heures, pour presque rien.
import fs from 'node:fs';
import path from 'node:path';

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

function readAt(file, pos, len) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, pos);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

// Paquet Godot (.pck) colle a la fin de l'exe : ... [pck][taille sur 8 octets]["GDPC"]
export function embeddedGodotPck(file) {
  try {
    const size = fs.statSync(file).size;
    if (size < 32) return null;
    const tail = readAt(file, size - 12, 12);
    if (tail.subarray(8, 12).toString('latin1') !== 'GDPC') return null;
    const pckSize = Number(tail.readBigUInt64LE(0));
    const start = size - 12 - pckSize;
    if (pckSize <= 0 || start < 0) return null;
    const head = readAt(file, start, 4).toString('latin1');
    return head === 'GDPC' ? { start, size: pckSize } : { start, size: pckSize, unverified: true };
  } catch { return null; }
}

// Appli .NET : en-tete PE avec le repertoire "CLR Runtime Header" (index 14) rempli.
function isDotNetPe(file) {
  try {
    const dos = readAt(file, 0, 64);
    if (dos.toString('latin1', 0, 2) !== 'MZ') return false;
    const pe = dos.readUInt32LE(60);
    const hdr = readAt(file, pe, 24 + 240);
    if (hdr.toString('latin1', 0, 4) !== 'PE\0\0') return false;
    const magic = hdr.readUInt16LE(24);
    const dirs = 24 + (magic === 0x20b ? 112 : 96);
    return hdr.length >= dirs + 15 * 8 && hdr.readUInt32LE(dirs + 14 * 8) !== 0;
  } catch { return false; }
}

// Exe PyInstaller : signature "MEI\x0c\x0b\x0a\x0b\x0e" dans les derniers Ko.
function isPyInstaller(file) {
  try {
    const size = fs.statSync(file).size;
    const tail = readAt(file, Math.max(0, size - 8192), Math.min(size, 8192));
    return tail.includes(Buffer.from([0x4d, 0x45, 0x49, 0x0c, 0x0b, 0x0a, 0x0b, 0x0e]));
  } catch { return false; }
}

// Renvoie { id, label, engine, why, ghidraUseful, files: {...}, advice }
export function detectRuntime(exePath) {
  if (!exePath || !exists(exePath)) return null;
  const dir = path.dirname(exePath);
  const base = path.basename(exePath, path.extname(exePath));
  const ext = path.extname(exePath).toLowerCase();
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { /* ignore */ }
  const has = (name) => entries.some((e) => e.toLowerCase() === name.toLowerCase());

  // --- Godot
  if (ext === '.pck') return godot({ pck: exePath }, 'Paquet de jeu Godot (.pck).');
  const emb = ext === '.exe' ? embeddedGodotPck(exePath) : null;
  if (emb) return godot({ exe: exePath, embedded: emb }, 'Le paquet du jeu (.pck) est intégré à la fin du .exe.');
  const sibling = entries.find((e) => e.toLowerCase() === `${base.toLowerCase()}.pck`) || entries.find((e) => e.toLowerCase().endsWith('.pck'));
  if (sibling) return godot({ exe: exePath, pck: path.join(dir, sibling) }, `Paquet du jeu trouvé à côté : ${sibling}.`);

  // --- Unity
  const dataDir = entries.find((e) => e.toLowerCase() === `${base.toLowerCase()}_data`) || entries.find((e) => /_data$/i.test(e) && exists(path.join(dir, e, 'globalgamemanagers')));
  if (has('UnityPlayer.dll') || dataDir) {
    const d = dataDir ? path.join(dir, dataDir) : null;
    const metadata = d && path.join(d, 'il2cpp_data', 'Metadata', 'global-metadata.dat');
    if (has('GameAssembly.dll') && metadata && exists(metadata)) {
      return {
        id: 'unity-il2cpp', engine: 'Unity', label: 'Jeu Unity (IL2CPP)', ghidraUseful: false,
        why: 'Le code C# du jeu a été converti en C++ dans GameAssembly.dll ; les noms des classes et fonctions sont dans global-metadata.dat.',
        files: { metadata, gameAssembly: path.join(dir, 'GameAssembly.dll') },
        advice: 'FREE lit les métadonnées IL2CPP : toutes les classes, méthodes et champs du jeu, avec leurs vrais noms. Ghidra sur le .exe n\'analyserait que le lanceur Unity.',
      };
    }
    const managed = d && path.join(d, 'Managed', 'Assembly-CSharp.dll');
    if (managed && exists(managed)) {
      const firstpass = path.join(d, 'Managed', 'Assembly-CSharp-firstpass.dll');
      return {
        id: 'unity-mono', engine: 'Unity', label: 'Jeu Unity (Mono / C#)', ghidraUseful: false,
        why: 'Le code du jeu est en C# (.NET), dans Assembly-CSharp.dll, pas dans le .exe.',
        files: { managed, ...(exists(firstpass) ? { managed2: firstpass } : {}) },
        advice: 'FREE lit directement le code C# du jeu (classes, méthodes, champs). Ghidra sur le .exe n\'analyserait que le lanceur Unity.',
      };
    }
    return { id: 'unity', engine: 'Unity', label: 'Jeu Unity', ghidraUseful: false, files: {}, why: 'Moteur Unity détecté, mais le code du jeu n\'a pas été trouvé à l\'endroit habituel.',
      advice: 'Ghidra sur le .exe n\'analyserait que le lanceur Unity.' };
  }

  // --- Unreal Engine
  const paks = entries.some((e) => exists(path.join(dir, e, 'Content', 'Paks')));
  if (has('Engine') || paks) {
    return { id: 'unreal', engine: 'Unreal', label: 'Jeu Unreal Engine', ghidraUseful: true, files: {},
      why: 'Les jeux Unreal ont leur logique compilée en C++ (et en Blueprints dans les fichiers .pak).',
      advice: 'Ghidra peut aider (code C++), mais le fichier est souvent énorme : l\'analyse approfondie peut prendre des heures. Les Blueprints (.pak) ne sont pas lus par FREE.' };
  }

  // --- GameMaker
  if (has('data.win')) {
    return { id: 'gamemaker', engine: 'GameMaker', label: 'Jeu GameMaker', ghidraUseful: false, files: { data: path.join(dir, 'data.win') },
      why: 'La logique du jeu est dans data.win (bytecode GameMaker), pas dans le .exe.',
      advice: 'Ghidra sur le .exe n\'analyserait que le moteur GameMaker. Un outil spécialisé (comme UndertaleModTool) lit data.win ; FREE ne l\'intègre pas encore.' };
  }

  // --- Programmes "geres" (.NET, Java, Python)
  if (ext === '.jar') {
    return { id: 'java', engine: 'Java', label: 'Programme Java (.jar)', ghidraUseful: false, files: {},
      why: 'Le code Java est du bytecode, pas du code machine.', advice: 'Ghidra n\'est pas adapté aux .jar. Un décompilateur Java (comme JD-GUI ou Vineflower) donne directement le code source.' };
  }
  if (ext === '.exe' || ext === '.dll') {
    if (isDotNetPe(exePath)) {
      return { id: 'dotnet', engine: '.NET', label: 'Programme .NET (C#, VB.NET…)', ghidraUseful: false, files: { managed: exePath },
        why: 'Le programme est en .NET : son code est du bytecode avec les noms des classes et des méthodes.',
        advice: 'FREE lit directement les classes, méthodes et références .NET. Ghidra n\'est pas adapté à ce type de code.' };
    }
    if (isPyInstaller(exePath)) {
      return { id: 'python', engine: 'Python', label: 'Programme Python (PyInstaller)', ghidraUseful: false, files: {},
        why: 'Le .exe contient l\'interpréteur Python et les scripts compilés (.pyc).',
        advice: 'Ghidra n\'analyserait que l\'interpréteur Python. Il faut extraire les .pyc (pyinstxtractor) puis les décompiler ; FREE ne l\'intègre pas encore.' };
    }
  }
  return { id: 'native', engine: null, label: 'Programme natif (C, C++, Rust…)', ghidraUseful: true, files: {}, why: 'Code machine : c\'est le domaine de Ghidra.', advice: '' };
}

function godot(files, where) {
  return {
    id: 'godot', engine: 'Godot', label: 'Jeu Godot', ghidraUseful: false, files,
    why: `Le .exe contient surtout le moteur Godot (libre et identique pour tous les jeux). La logique du jeu est dans ses scripts GDScript. ${where}`,
    advice: 'FREE liste le contenu du paquet du jeu (scripts, scènes, ressources). Pour lire les scripts eux-mêmes, FREE peut utiliser GDRE Tools (gratuit, open source), avec votre accord.',
  };
}

// Copie le paquet Godot integre dans un fichier .pck a part (REA sait inventorier un .pck isole).
export function extractEmbeddedPck(exePath, emb, outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(exePath, { start: emb.start, end: emb.start + emb.size - 1 });
    const ws = fs.createWriteStream(outFile);
    rs.on('error', reject); ws.on('error', reject);
    ws.on('finish', () => resolve(outFile));
    rs.pipe(ws);
  });
}
