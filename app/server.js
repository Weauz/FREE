// FREE : serveur local (http://localhost:4747).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { connectRea, listReaTools, callRea, reaStatus } from './lib/rea.js';
import { listOpenApps, describeFile, pickFile, openFolder, listBrowserTabs } from './lib/system.js';
import { bus, createAnalysis, rerunAnalysis, listAnalyses, getAnalysis, getStepResult, deleteAnalysis, analysisDir, markInterrupted, deleteEnquete } from './lib/analyses.js';
markInterrupted();
import { claudeAvailable, claudeFullStatus, installClaude, openClaudeLogin, startPlan, startBuild, startChange, startDeep, stopJob, jobLog, isRunning, anyClaudeRunning } from './lib/claude.js';
import { checkUpdates, updatesStatus, startUpdateChecks, npmUpdateRea, launchInstaller, downloadAndRunFreeUpdate } from './lib/updates.js';
import { enrich, CATEGORIES } from './lib/catalog.js';
import { mountMcpProxy } from './lib/mcp-proxy.js';
import { closeWithSnapshot, hasSnapshot, snapshotPathFor, closeRea, reaBusy } from './lib/rea.js';
import { exportEvidence } from './lib/analyses.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '50mb' }));
// no-cache : le navigateur revalide a chaque chargement, donc les mises a jour de FREE s'affichent tout de suite.
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

// Protection basique : n'accepter que les requetes venant de la page locale.
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return res.status(403).json({ error: 'Origine refusee' });
  next();
});

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { res.status(400).json({ error: e.message }); }
};

// ---------- Etat general
app.get('/api/status', wrap(async () => {
  let rea = reaStatus();
  if (!rea.connected) { try { await connectRea(); } catch { /* reported below */ } rea = reaStatus(); }
  return {
    rea,
    claude: await claudeFullStatus(),
    ghidra: { installDir: process.env.GHIDRA_INSTALL_DIR || null, javaHome: process.env.JAVA_HOME || null },
    paths: { data: config.dataDir, projects: config.projectsDir },
    platform: process.platform,
  };
}));

// ---------- Cibles
app.get('/api/apps', wrap(() => listOpenApps()));
app.get('/api/tabs', wrap(() => listBrowserTabs()));
app.post('/api/pick-file', wrap(async () => ({ path: await pickFile() })));
app.post('/api/describe-file', wrap((req) => describeFile(String(req.body.path || '').trim().replace(/^"|"$/g, ''))));

// ---------- Analyses
app.get('/api/analyses', wrap(() => listAnalyses()));
app.post('/api/analyses', wrap((req) => {
  const { target, options } = req.body;
  if (!target?.kind) throw new Error('Cible manquante');
  if (target.kind === 'web') {
    let u = String(target.url || '').trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    target.url = new URL(u).href;
    target.name = target.name || new URL(u).hostname;
  } else if (!target.path && !target.exe) throw new Error('Chemin manquant');
  return createAnalysis(target, options || {});
}));
app.get('/api/analyses/:id', wrap((req) => {
  const a = getAnalysis(req.params.id);
  if (!a) throw new Error('Analyse introuvable');
  const bin = a.target.exe || (a.target.kind === 'native' ? a.target.path : null);
  a.enquetes = a.enquetes.map((e) => ({ ...e, log: jobLog(a.id, `enquete-${e.id}`) }));
  return {
    ...a,
    snapshot: bin && hasSnapshot(bin) ? snapshotPathFor(bin) : null,
    hasEvidence: fs.existsSync(path.join(a.dir, 'preuves-rea.json')),
    jobs: {
      deep: { running: isRunning(`${a.id}:deep`) },
      plan: { running: isRunning(`${a.id}:plan`), log: jobLog(a.id, 'plan') },
      build: { running: isRunning(`${a.id}:build`), log: jobLog(a.id, 'build') },
      change: { running: isRunning(`${a.id}:change`), log: jobLog(a.id, 'change') },
    },
  };
}));
app.post('/api/analyses/:id/rerun', wrap((req) => rerunAnalysis(req.params.id, req.body || {})));
app.get('/api/analyses/:id/steps/:step', wrap((req) => getStepResult(req.params.id, req.params.step)));
app.get('/api/analyses/:id/file/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const f = path.join(analysisDir(req.params.id), name);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});
app.delete('/api/analyses/:id', wrap((req) => { deleteAnalysis(req.params.id); return { ok: true }; }));
app.put('/api/analyses/:id/plan', wrap((req) => {
  fs.writeFileSync(path.join(analysisDir(req.params.id), 'PLAN.md'), String(req.body.plan || ''));
  return { ok: true };
}));

// ---------- Claude Code
app.post('/api/analyses/:id/deep', wrap((req) => startDeep(req.params.id, req.body || {})));
app.delete('/api/analyses/:id/enquetes/:eid', wrap((req) => { deleteEnquete(req.params.id, req.params.eid); return { ok: true }; }));
app.post('/api/analyses/:id/plan', wrap((req) => startPlan(req.params.id, req.body?.instructions)));
app.post('/api/analyses/:id/build', wrap((req) => startBuild(req.params.id, req.body || {})));
app.post('/api/analyses/:id/change', wrap((req) => startChange(req.params.id, req.body || {})));
app.post('/api/jobs/stop', wrap((req) => ({ stopped: stopJob(req.body.jobId) })));

// ---------- Outils REA (catalogue complet)
app.get('/api/tools', wrap(async () => ({ categories: CATEGORIES, tools: (await listReaTools()).map(enrich) })));
app.post('/api/tools/:name', wrap(async (req) => {
  const r = await callRea(req.params.name, req.body || {});
  return { ok: r.ok, data: r.data, text: r.text, images: r.images.map((i) => `data:${i.mimeType};base64,${i.data}`) };
}));

// ---------- Reglages de l'interface (gardes sur disque)
const settingsFile = path.join(config.dataDir, 'reglages.json');
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; } };
app.get('/api/settings', wrap(() => readSettings()));
app.post('/api/settings', wrap((req) => { const s = { ...readSettings(), ...(req.body || {}) }; fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2)); return s; }));

// ---------- Claude Code : installation et connexion guidees
app.get('/api/claude', wrap(() => claudeFullStatus()));
app.post('/api/claude/install', wrap(async () => { await installClaude(); return claudeFullStatus(); }));
app.post('/api/claude/login', wrap(() => openClaudeLogin()));

// ---------- Mises a jour (REA et Ghidra)
function busyReason() {
  if (listAnalyses().some((a) => a.status === 'running' || a.status === 'queued')) return 'une analyse est en cours';
  if (anyClaudeRunning()) return 'Claude Code travaille (enquête, plan ou reconstruction)';
  if (reaBusy()) return 'REA est occupé';
  return null;
}
app.get('/api/busy', wrap(() => ({ busy: busyReason() })));
app.get('/api/updates', wrap(async (req) => (req.query.refresh ? checkUpdates() : updatesStatus())));
app.post('/api/updates/rea', wrap(async () => {
  const why = busyReason();
  if (why) throw new Error(`Mise à jour impossible pour l'instant : ${why}. Réessayez quand c'est terminé.`);
  await closeWithSnapshot().catch(() => {});
  await closeRea();
  await npmUpdateRea();
  await connectRea();
  return checkUpdates();
}));
app.post('/api/updates/ghidra', wrap(async () => {
  const why = busyReason();
  if (why) throw new Error(`Mise à jour impossible pour l'instant : ${why}. Réessayez quand c'est terminé.`);
  return { installer: launchInstaller() };
}));

app.post('/api/updates/free', wrap(async () => {
  const why = busyReason();
  if (why) throw new Error(`Mise à jour impossible pour l'instant : ${why}. Réessayez quand c'est terminé.`);
  const r = await downloadAndRunFreeUpdate();
  // Mise a jour automatique : on s'arrete proprement, l'installateur remplace les fichiers puis relance FREE.
  if (r.auto) setTimeout(shutdown, 1500);
  return r;
}));

// ---------- Divers
// Ouvre une page de FREE (GitHub) ou d'Anthropic dans le navigateur habituel (pas dans la fenetre FREE).
app.post('/api/open-url', wrap((req) => {
  const u = String(req.body.url || '');
  if (!/^https:\/\/(github\.com\/Weauz\/FREE|www\.anthropic\.com\/legal)[\w\-\/#%.?=&]*$/i.test(u)) throw new Error('Adresse non autorisée');
  if (config.isWin) spawn('rundll32.exe', ['url.dll,FileProtocolHandler', u], { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
}));
app.post('/api/open-folder', wrap((req) => {
  const p = String(req.body.path || '');
  if (!fs.existsSync(p)) throw new Error('Dossier introuvable');
  openFolder(p);
  return { ok: true };
}));

// ---------- Enchainement automatique : reanalyse approfondie des que l'analyse se termine
// (le programme est encore charge dans Ghidra, Claude Code en profite sans reimport).
bus.on('analysis-finished', (meta) => {
  if (!meta.options?.autoDeep || meta.status !== 'done') return;
  try { startDeep(meta.id, { focus: meta.options.deepFocus || '' }); }
  catch (e) { console.log(`  Reanalyse automatique impossible : ${e.message}`); }
});

// Apres une enquete de Claude Code : mise a jour du fichier de preuves de l'analyse.
bus.on('claude-finished', ({ analysisId, kind }) => { if (kind.startsWith('enquete-')) exportEvidence(analysisId).catch(() => {}); });

// ---------- Passerelle MCP pour Claude Code (reutilise la session REA / Ghidra de FREE)
mountMcpProxy(app);

// ---------- Evenements temps reel (Server-Sent Events)
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  bus.on('event', send);
  req.on('close', () => { clearInterval(ping); bus.off('event', send); });
});

const httpServer = app.listen(config.port, '127.0.0.1', () => {
  const url = `http://localhost:${config.port}`;
  console.log(`\n  FREE est prêt : ${url}\n  (laissez cette fenêtre ouverte ; fermez-la pour arreter)\n`);
  if (config.isWin && !process.env.FREE_NO_BROWSER) spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  connectRea().catch((e) => console.log('  REA : ' + e.message));
  startUpdateChecks();
});
// Les appels REA via la passerelle MCP peuvent durer longtemps (Ghidra) : pas de delai HTTP.
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 120000;
httpServer.keepAliveTimeout = 0;

// A la fermeture de FREE : sauvegarde de ce que Ghidra a calcule, pour recharger vite la prochaine fois.
let quitting = false;
async function shutdown() {
  if (quitting) return; quitting = true;
  console.log('\n  Sauvegarde de l\'analyse Ghidra en cours, patientez...');
  const t = setTimeout(() => process.exit(0), 25000);
  try { await closeWithSnapshot(); await closeRea(); } catch { /* ignore */ }
  clearTimeout(t);
  process.exit(0);
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, shutdown);
app.post('/api/save-and-quit', (req, res) => { res.json({ ok: true }); setTimeout(shutdown, 200); });
