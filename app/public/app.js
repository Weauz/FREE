// FREE - interface (JavaScript sans framework)
const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const state = { apps: null, selectedApp: null, homeTab: 'apps', tools: null, status: null, current: null };

// ---------- Utilitaires
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}
function toast(msg, ms = 3200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms);
}
const fmtDur = (ms) => ms == null ? '' : ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round(ms % 60000 / 1000)} s`;
const fmtDate = (iso) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const fmtShort = (s) => s < 60 ? `${Math.max(1, Math.round(s))} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round(s % 3600 / 60)).padStart(2, '0')}`;
const fmtEst = (e) => !e ? '' : e[1] < 60 ? 'quelques secondes' : `≈ ${fmtShort(e[0])} à ${fmtShort(e[1])}`;
const fmtElapsed = (ms) => { const s = Math.floor(ms / 1000); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };
function remainingEst(steps) {
  let lo = 0, hi = 0;
  for (const s of steps) {
    if (!s.est || s.status === 'done' || s.status === 'error' || s.status === 'skipped') continue;
    const spent = s.status === 'running' && s.startedAt ? (Date.now() - s.startedAt) / 1000 : 0;
    lo += Math.max(0, s.est[0] - spent); hi += Math.max(s.status === 'running' ? 30 : 0, s.est[1] - spent);
  }
  return hi > 0 ? [lo, hi] : null;
}
// Chronometres en direct (elements portant data-started)
setInterval(() => document.querySelectorAll('[data-started]').forEach((el) => { el.textContent = fmtElapsed(Date.now() - Number(el.dataset.started)); }), 1000);
const fmtBytes = (b) => b == null ? '' : b < 1024 ? `${b} o` : b < 1048576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1048576).toFixed(1)} Mo`;
const KIND = { web: ['🌐', 'Site web', 'web'], electron: ['🧩', 'Electron', 'electron'], native: ['🪟', 'Natif Windows', 'native'] };
const kindBadge = (k) => `<span class="badge ${KIND[k]?.[2] || ''}">${KIND[k]?.[1] || k}</span>`;
const statusIcon = (s) => ({ pending: '<span class="muted">○</span>', running: '<span class="spin"></span>', done: '<span style="color:var(--green)">✓</span>', error: '<span style="color:var(--red)">✕</span>', skipped: '<span class="muted">–</span>', queued: '<span class="muted">○</span>', waiting: '<span title="En attente" style="color:var(--orange)">⏸</span>' }[s] || '');
const statusLabel = { queued: 'En attente', running: 'En cours', done: 'Terminée', error: 'Erreur' };

// ---------- Bulles d'aide « ? » (explications simples, qu'un enfant peut comprendre)
const HELP = {
  analyse: "On ouvre le programme comme on démonte un jouet pour regarder dedans, sans le casser. FREE note tout ce qu'il voit : de quoi il est fait, ce qu'il utilise et ce qu'il contient.",
  deep: "Tu poses une question, comme « comment le jeu sauvegarde ? ». Claude devient détective : il prend la loupe, fouille dans le programme et t'écrit la réponse avec les preuves. Chaque question a sa fiche, et le plan les utilise toutes.",
  plan: "Avant de construire une maison, on fait un dessin. Ici, Claude écrit le plan : ce que fait l'appli et comment on va en fabriquer une à toi. Il n'y a pas encore de code, tu peux relire et changer le plan.",
  build: "Claude suit le plan et fabrique pour de vrai une nouvelle appli, comme un Lego qu'on monte avec la notice. Elle marche de la même façon, mais c'est la tienne : rien n'est copié.",
  change: "Ton appli est construite. Tu peux maintenant demander des changements, comme « mets-la en noir » ou « ajoute un bouton », et Claude les fait pour toi. Tu peux aussi lui poser des questions.",
  ghidra: "Ghidra est un outil qui sait lire le langage des machines (plein de 0 et de 1) et le traduire en quelque chose de plus lisible. C'est très complet mais ça peut être long.",
  autodeep: "Dès que l'analyse est finie, Claude lance tout seul une enquête (dans l'onglet Enquêtes). Tu n'as rien à faire, tu reviens plus tard et la réponse est prête.",
  steps: {
    desktop: "On regarde de quoi l'appli est fabriquée, comme deviner si un gâteau est au chocolat ou à la vanille rien qu'en le regardant.",
    imports: "Un programme demande de l'aide à Windows : ouvrir un fichier, afficher une fenêtre, aller sur Internet… Ici, on lit la liste de tout ce qu'il demande.",
    hardening: "On vérifie les cadenas du programme : les protections qui empêchent les pirates de l'attaquer.",
    resources: "On regarde ce qui est rangé à l'intérieur du programme : ses images, ses icônes et ses textes.",
    fuses: "Une appli Electron a des petits interrupteurs de sécurité. On regarde s'ils sont allumés ou éteints.",
    js: "Cette appli est écrite en JavaScript. On dessine la carte de tous ses fichiers et on note qui parle à qui.",
    open: "On prépare Ghidra, l'outil qui va lire le programme dans le langage des machines.",
    'open-web': "FREE ouvre le site dans un navigateur spécial qu'il peut observer, comme regarder à travers une vitre.",
    overview: "Ghidra lit tout le programme et le traduit. C'est l'étape la plus longue, comme lire un très gros livre en entier.",
    procedures: "Un programme est fait de petites recettes qu'on appelle des fonctions. On en fait la liste.",
    strings: "On cherche tous les mots et les phrases cachés dans le programme : messages, menus, adresses…",
    screenshot: "On prend une photo de la page, comme une capture d'écran.",
    page: "On regarde comment la page est construite : ses blocs, ses images et tout ce qu'elle télécharge.",
    bundle: "On lit le code JavaScript du site pour trouver ses pages et les serveurs avec qui il discute.",
  },
};
// Durees estimees des etapes Claude Code (secondes) et chrono en direct quand elles tournent
const JOB_EST = { deep: [600, 2400], plan: [120, 600], build: [600, 2700], change: [60, 600] };
function jobTimer(kind, job) {
  const est = JOB_EST[kind];
  if (job?.running) {
    const startEntry = [...(job.log || [])].reverse().find((e) => (e.t === 'start' || e.t === 'user') && e.ts);
    const since = startEntry?.ts;
    return `<span class="badge warn">⏱ ${since ? `<span data-started="${since}">${fmtElapsed(Date.now() - since)}</span> / ` : 'en cours · '}${fmtEst(est)}</span>`;
  }
  const last = [...(job?.log || [])].reverse().find((e) => e.t === 'result' && e.durationMs);
  return `<span class="badge">⏱ ${fmtEst(est)}${last ? ` · dernière fois : ${fmtDur(last.durationMs)}` : ''}</span>`;
}

const help = (text) => text ? `<span class="helpwrap"><button type="button" class="help" aria-label="Explication" data-help>?</button><span class="help-pop" role="tooltip" hidden>${esc(text)}</span></span>` : '';
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-help]');
  document.querySelectorAll('.help-pop').forEach((p) => { if (!b || p !== b.nextElementSibling) p.hidden = true; });
  if (b) { e.preventDefault(); e.stopPropagation(); b.nextElementSibling.hidden = !b.nextElementSibling.hidden; }
}, true);

// ---------- Markdown minimal
function md(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  let html = '', inCode = false, list = null, table = null;
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--accent)">$1</a>');
  const close = () => { if (list) { html += `</${list}>`; list = null; } if (table) { html += '</table>'; table = null; } };
  for (const l of lines) {
    if (l.startsWith('```')) { close(); html += inCode ? '</code></pre>' : '<pre><code>'; inCode = !inCode; continue; }
    if (inCode) { html += esc(l) + '\n'; continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { close(); html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if (/^\s*\|.*\|\s*$/.test(l)) {
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue;
      if (!table) { close(); html += '<table>'; table = true; }
      html += '<tr>' + l.trim().slice(1, -1).split('|').map((c) => `<td>${inline(c.trim())}</td>`).join('') + '</tr>';
    }
    else if (l.startsWith('>')) { close(); html += `<blockquote>${inline(l.slice(1))}</blockquote>`; }
    else if (!l.trim()) close();
    else { close(); html += `<p>${inline(l)}</p>`; }
  }
  close();
  if (inCode) html += '</code></pre>';
  return html;
}

// ---------- Visionneuse JSON repliable
function jsonView(v, key = null, depth = 0) {
  const k = key != null ? `<span class="k">${esc(key)}</span>: ` : '';
  if (v === null || typeof v !== 'object') {
    let cls = 'z', txt = 'null';
    if (typeof v === 'string') { cls = 's'; txt = JSON.stringify(v.length > 2000 ? v.slice(0, 2000) + '…' : v); }
    else if (typeof v === 'number') { cls = 'n'; txt = v; }
    else if (typeof v === 'boolean') { cls = 'b'; txt = v; }
    return `<div class="line">${k}<span class="${cls}">${esc(txt)}</span></div>`;
  }
  const isArr = Array.isArray(v);
  const entries = isArr ? v.map((x, i) => [i, x]) : Object.entries(v);
  const label = isArr ? `[${entries.length}]` : `{${entries.length}}`;
  const shown = entries.slice(0, 300);
  const more = entries.length > 300 ? `<div class="line z">… ${entries.length - 300} éléments de plus (voir le fichier JSON)</div>` : '';
  return `<details ${depth < 1 ? 'open' : ''}><summary>${k}<span class="z">${label}</span></summary>${shown.map(([kk, vv]) => jsonView(vv, kk, depth + 1)).join('')}${more}</details>`;
}

// ---------- Barre laterale
async function refreshSidebar() {
  try {
    const list = await api('/analyses');
    $('#recent').innerHTML = list.slice(0, 15).map((a) => `
      <a href="#/analyse/${a.id}" data-id="${a.id}" class="${state.current === a.id ? 'active' : ''}">
        <span class="dot ${a.status}"></span>${KIND[a.target.kind]?.[0] || ''} ${esc(a.target.name || a.target.url)}</a>`).join('')
      || '<div class="muted small" style="padding:4px 8px">Aucune analyse pour l\'instant</div>';
  } catch { /* serveur indisponible */ }
}
// ---------- Bienvenue : installation et connexion de Claude Code
function maybeClaudeSetup(force = false) {
  const c = state.status?.claude;
  if (!c) return;
  const skipped = !!state.settings?.skipClaude;
  if (force || (!c.loggedIn && !skipped)) showClaudeSetup();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-claudesetup]')) showClaudeSetup(); });

let setupPoll = null;
function showClaudeSetup() {
  let ov = $('#setup');
  if (!ov) { ov = document.createElement('div'); ov.id = 'setup'; document.body.appendChild(ov); }
  const c = state.status?.claude || {};
  const step = (n, done, title, body) => `<div class="sstep ${done ? 'done' : ''}"><span class="snum">${done ? '✓' : n}</span><div><b>${title}</b>${body}</div></div>`;
  ov.innerHTML = `<div class="setup-box" role="dialog" aria-modal="true" aria-labelledby="setup-t">
    <img src="logo.svg" alt="" width="48" height="48">
    <h1 id="setup-t">Bienvenue dans FREE 👋</h1>
    <p class="muted">Dernière étape : <b>Claude Code</b>. C'est lui qui mène les enquêtes, écrit le plan et reconstruit les applis.
      Il faut un abonnement Claude <b>Pro, Max, Team ou Enterprise</b>.</p>
    ${step(1, c.installed, 'Installer Claude Code', c.installed
      ? `<p class="muted small">Installé${c.version ? ` (${esc(c.version)})` : ''}.</p>`
      : `<p class="muted small">Environ 1 à 2 minutes.</p><button class="btn primary" id="s-install">Installer Claude Code</button>`)}
    ${step(2, c.loggedIn, 'Se connecter à votre compte Claude', c.loggedIn
      ? `<p class="muted small">Connecté${c.email ? ` : ${esc(c.email)}` : ''}.</p>`
      : `<ol class="small muted" style="margin:6px 0 10px;padding-left:18px">
           <li>Cliquez sur « Se connecter » : une fenêtre s'ouvre, puis une page dans le navigateur.</li>
           <li>Connectez-vous avec votre compte Claude.</li>
           <li>Si un code s'affiche, copiez-le et collez-le dans la fenêtre avec un <b>clic droit</b>, puis Entrée.</li>
         </ol>
         <button class="btn primary" id="s-login" ${c.installed ? '' : 'disabled'}>Se connecter</button>
         <span class="muted small" id="s-wait" hidden><span class="spin"></span> En attente de la connexion…</span>`)}
    <div class="row" style="margin-top:18px">
      ${c.loggedIn ? '<button class="btn primary" id="s-done">C\'est prêt, commencer !</button>' : '<button class="btn ghost" id="s-skip">Continuer sans Claude Code (analyses seulement)</button>'}
      <span class="grow"></span><button class="btn ghost small" id="s-refresh">↻ Vérifier à nouveau</button>
    </div>
  </div>`;
  const close = () => { ov.remove(); clearInterval(setupPoll); setupPoll = null; };
  const recheck = async () => {
    try { state.status.claude = await api('/claude'); } catch { return; }
    if (state.status.claude.loggedIn) { clearInterval(setupPoll); setupPoll = null; }
    refreshStatus(); showClaudeSetup();
  };
  $('#s-refresh').onclick = recheck;
  if ($('#s-done')) $('#s-done').onclick = () => { close(); location.reload(); };
  if ($('#s-skip')) $('#s-skip').onclick = async () => { state.settings = await api('/settings', { body: { skipClaude: true } }).catch(() => state.settings); close(); };
  if ($('#s-install')) $('#s-install').onclick = async (e) => {
    e.target.disabled = true; e.target.innerHTML = '<span class="spin"></span> Installation…';
    try { state.status.claude = await api('/claude/install', { body: {} }); } catch (err) { toast(err.message, 8000); }
    showClaudeSetup();
  };
  if ($('#s-login')) $('#s-login').onclick = async () => {
    try { await api('/claude/login', { body: {} }); } catch (err) { toast(err.message, 8000); return; }
    $('#s-wait').hidden = false;
    clearInterval(setupPoll); setupPoll = setInterval(recheck, 4000);
  };
  if (setupPoll && $('#s-wait')) $('#s-wait').hidden = false;
}

// ---------- Mises a jour disponibles (REA, Ghidra)
function updatesHtml() {
  const u = state.updates;
  if (!u) return '';
  let h = '';
  if (u.free?.available) h += `<div class="upd upd-free" title="${esc(u.free.notes || 'Nouvelle version de FREE')}">✨ <b>FREE</b> ${esc(u.free.installed)} → ${esc(u.free.latest)} <button class="btn small primary" data-upd="free" title="${u.free.auto ? 'Télécharge et installe la nouvelle version, puis relance FREE (vos analyses et projets sont gardés)' : 'Télécharge et ouvre l\'installateur de la nouvelle version'}">Mettre à jour</button></div>`;
  if (u.rea?.available) h += `<div class="upd">⬆️ <b>REA</b> ${esc(u.rea.installed)} → ${esc(u.rea.latest)} <button class="btn small" data-upd="rea" title="Installe la nouvelle version de REA puis le recharge (1 à 2 min)">Mettre à jour</button></div>`;
  if (u.ghidra?.available) h += `<div class="upd">⬆️ <b>Ghidra</b> ${esc(u.ghidra.installed)} → ${esc(u.ghidra.latest)} <button class="btn small" data-upd="ghidra" title="Ouvre l'installateur, qui propose de télécharger la nouvelle version${u.ghidra.sizeMb ? ` (${u.ghidra.sizeMb} Mo)` : ''}">Mettre à jour</button></div>`;
  return h;
}
async function loadUpdates() {
  try { state.updates = await api('/updates'); } catch { state.updates = null; }
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-upd]'); if (!b) return;
  const what = b.dataset.upd;
  if (what === 'ghidra' && !confirm('Mettre à jour Ghidra ?\n\nL\'installateur va s\'ouvrir et proposer de télécharger la nouvelle version. Quand il a fini, quittez FREE avec le bouton et relancez-le.')) return;
  if (what === 'rea' && !confirm('Mettre à jour REA maintenant ? Cela prend 1 à 2 minutes.')) return;
  if (what === 'free') {
    const f = state.updates?.free || {};
    const msg = `Mettre à jour FREE vers la version ${f.latest} ?` + (f.notes ? `\n\nNouveautés :\n${f.notes.slice(0, 600)}` : '') +
      (f.auto ? '\n\nFREE va se fermer en sauvegardant, s\'installer puis se relancer tout seul (environ 1 minute). Vos analyses et projets sont gardés.'
              : '\n\nL\'installateur de la nouvelle version va s\'ouvrir : suivez-le.');
    if (!confirm(msg)) return;
  }
  b.disabled = true; b.innerHTML = '<span class="spin"></span>';
  try {
    if (what === 'free') {
      const r = await api('/updates/free', { body: {} });
      if (r.auto) { document.body.innerHTML = '<div style="margin:auto;text-align:center;color:#787774;font:15px system-ui"><p style="font-size:28px">✨</p><p>Mise à jour de FREE en cours…<br>FREE va se relancer tout seul dans un instant.</p></div>'; return; }
      toast('Installateur ouvert : suivez-le pour installer la nouvelle version.', 8000);
    }
    else if (what === 'rea') { state.updates = await api('/updates/rea', { body: {} }); toast('REA est à jour.'); }
    else { await api('/updates/ghidra', { body: {} }); toast('Installateur ouvert : suivez-le, puis relancez FREE.', 6000); }
  } catch (err) { toast(err.message, 6000); }
  refreshStatus();
});

async function refreshStatus() {
  try {
    const s = state.status = await api('/status');
    const line = (ok, label, detail) => `<div title="${esc(detail || '')}">${ok ? '🟢' : '🔴'} <b>${label}</b> <span>${esc(detail || '')}</span></div>`;
    $('#status').innerHTML = [
      line(s.rea.connected, 'REA', s.rea.connected ? `${s.rea.toolCount} outils` : 'non connecté'),
      line(!!s.ghidra.installDir, 'Ghidra', s.ghidra.installDir ? 'configuré' : 'non configuré'),
      `<div title="${esc(s.claude.email || '')}" style="cursor:pointer" data-claudesetup>${s.claude.loggedIn ? '🟢' : s.claude.installed ? '🟠' : '🔴'} <b>Claude Code</b> <span>${s.claude.loggedIn ? 'prêt' : s.claude.installed ? 'non connecté' : 'non installé'}</span></div>`,
    ].join('') + updatesHtml() + '<button class="btn ghost small" id="quit" style="margin-top:6px;justify-content:flex-start" title="Sauvegarde l\'analyse Ghidra en cours puis arrête FREE">⏻ Quitter FREE (en sauvegardant)</button>';
    $('#quit').onclick = async () => {
      if (!confirm('Sauvegarder l\'analyse Ghidra et arrêter FREE ?')) return;
      await api('/save-and-quit', { body: {} }).catch(() => {});
      document.body.innerHTML = '<div style="margin:auto;text-align:center;color:#787774;font:15px system-ui"><p style="font-size:28px">💾</p><p>Sauvegarde en cours, FREE va s\'arrêter.<br>Vous pouvez fermer cet onglet.</p></div>';
    };
  } catch {
    $('#status').innerHTML = '<div>🔴 <b>Serveur arrêté</b></div>';
  }
}
function setNav(name) {
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === name));
  document.querySelectorAll('#recent a').forEach((a) => a.classList.toggle('active', a.dataset.id === state.current));
}

// ---------- Page d'accueil
async function renderHome() {
  state.current = null; setNav('home');
  main.innerHTML = `<div class="page">
    <h1>Que voulez-vous rétro-ingénierer ?</h1>
    <p class="lead">Choisissez une appli ouverte, un site ou un fichier. REA l'analyse, puis Claude Code vous propose un plan et reconstruit une version à vous.</p>
    <div class="tabs">
      <button data-tab="apps">🪟 Appli ouverte</button>
      <button data-tab="web">🌐 Site web</button>
      <button data-tab="file">📄 Fichier ou dossier</button>
    </div>
    <div id="tab"></div>
    <div class="callout"><span>⚖️</span><div class="small">Utilisez REA sur des applis que vous avez le droit d'analyser. La reconstruction crée une <b>version originale</b> inspirée du fonctionnement, sans reprendre le code, les textes, les images ni la marque d'origine.</div></div>
  </div>`;
  main.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { state.homeTab = b.dataset.tab; renderTab(); });
  renderTab();
}

function renderTab() {
  main.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.homeTab));
  const el = $('#tab');
  if (state.homeTab === 'web') {
    el.innerHTML = `<div class="card">
      <h3 style="margin-top:0">Adresse du site</h3>
      <div class="row"><input id="url" class="grow" type="text" placeholder="https://exemple.com" autofocus><button class="btn primary" id="go">Analyser</button></div>
      <p class="muted small">REA ouvre le site dans un navigateur dédié (Chrome ou Edge en mode débogage), puis examine la page, le réseau et le code JavaScript sans rien modifier.
      Pour un site qui demande une connexion, connectez-vous dans la fenêtre ouverte puis relancez l'analyse.</p></div>`;
    const go = () => startAnalysis({ kind: 'web', url: $('#url').value });
    $('#go').onclick = go;
    $('#url').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  } else if (state.homeTab === 'file') {
    el.innerHTML = `<div class="card">
      <h3 style="margin-top:0">Chemin d'un .exe, d'une .dll, d'un .asar ou d'un dossier d'appli</h3>
      <div class="row"><input id="fpath" class="grow" type="text" placeholder="C:\\Program Files\\MonAppli\\MonAppli.exe"><button class="btn" id="pick">Parcourir…</button></div>
      <div id="fdesc"></div></div>`;
    $('#pick').onclick = async () => {
      try { const r = await api('/pick-file', { body: {} }); if (r.path) { $('#fpath').value = r.path; describe(); } } catch (e) { toast(e.message); }
    };
    $('#fpath').onchange = describe;
    async function describe() {
      const p = $('#fpath').value.trim(); if (!p) return;
      try {
        const d = await api('/describe-file', { body: { path: p } });
        renderLaunch($('#fdesc'), { ...d, name: d.name });
      } catch (e) { $('#fdesc').innerHTML = `<p class="err-text">${esc(e.message)}</p>`; }
    }
  } else {
    el.innerHTML = `<div class="row" style="margin-bottom:12px"><span class="muted grow">Applis avec une fenêtre ouverte sur votre PC</span><button class="btn" id="refresh">↻ Actualiser</button></div>
      <div id="apps" class="apps"><div class="muted">Recherche des applis…</div></div><div id="launch"></div>`;
    $('#refresh').onclick = () => { state.apps = null; loadApps(); };
    loadApps();
  }
}

async function loadApps() {
  const box = $('#apps'); if (!box) return;
  try {
    if (!state.apps) state.apps = await api('/apps');
    if (!state.apps.length) { box.innerHTML = '<div class="empty">Aucune appli fenêtrée trouvee.</div>'; return; }
    box.innerHTML = state.apps.map((a, i) => `
      <button class="app ${state.selectedApp === i ? 'selected' : ''}" data-i="${i}">
        ${a.icon ? `<img src="data:image/png;base64,${a.icon}" alt="">` : `<span class="ph">${KIND[a.kind][0]}</span>`}
        <span class="meta"><b>${esc(a.description || a.name)}</b><small>${esc(a.title || a.path)}</small></span>
        ${kindBadge(a.kind)}
      </button>`).join('');
    box.querySelectorAll('.app').forEach((b) => b.onclick = () => {
      state.selectedApp = Number(b.dataset.i);
      box.querySelectorAll('.app').forEach((x) => x.classList.toggle('selected', x === b));
      const a = state.apps[state.selectedApp];
      renderLaunch($('#launch'), { kind: a.kind, path: a.path, exe: a.path, asar: a.asar, name: a.description || a.name, icon: a.icon, onedrive: a.onedrive, company: a.company, version: a.version });
    });
  } catch (e) { box.innerHTML = `<div class="err-text">${esc(e.message)}</div>`; }
}

function renderLaunch(el, target) {
  const isNative = target.kind === 'native';
  el.innerHTML = `<div class="card launch">
    <div class="row"><b class="grow">${esc(target.name)}</b>${kindBadge(target.kind)}</div>
    <div class="muted small" style="overflow-wrap:anywhere">${esc(target.exe || target.path)}</div>
    ${target.onedrive ? `<div class="callout warn"><span>⚠️</span><div class="small">Ce fichier est dans OneDrive. REA refuse les fichiers OneDrive : copiez l'appli dans un dossier local (par ex. <code>C:\\analyse\\</code>) puis analysez la copie.</div></div>` : ''}
    ${target.kind === 'electron' ? `<p class="small muted">Appli Electron : REA va lire son code JavaScript (<code>${esc(target.asar || 'app.asar')}</code>), ses réglages de sécurité et sa structure.</p>` : ''}
    ${isNative ? `<label class="check"><input type="checkbox" id="deep"> <span><b>Analyse profonde avec Ghidra</b> ${help(HELP.ghidra)}<br><span class="small muted">Décompile le programme pour lister ses fonctions et ses textes. De quelques minutes à plus d'une heure selon la taille du fichier.</span></span></label>
    <div class="row small" id="ghidrarow" style="margin:-4px 0 12px 24px" hidden><span class="muted">Temps maximum laissé à Ghidra :</span>
      <select id="ghidramin" style="width:auto"><option value="45">45 min</option><option value="120" selected>2 h</option><option value="240">4 h</option><option value="480">8 h</option><option value="1440">24 h</option></select></div>` : ''}
    <label class="check"><input type="checkbox" id="autodeep" ${state.status?.claude?.ok ? 'checked' : 'disabled'}> <span><b>Puis enquête automatique avec Claude Code</b> ${help(HELP.autodeep)}<br><span class="small muted">${state.status?.claude?.ok ? 'Dès la fin de l\'analyse, Claude Code enquête avec les outils REA en réutilisant ce qui est déjà chargé (≈ 10 à 40 min de plus). La réponse apparaît dans l\'onglet Enquêtes.' : 'Indisponible : Claude Code n\'est pas détecté.'}</span></span></label>
    <div id="focusrow" style="margin:-4px 0 12px 24px" ${state.status?.claude?.ok ? '' : 'hidden'}><input id="deepfocus0" type="text" placeholder="Facultatif : quelle fonctionnalité voulez-vous comprendre ? (vide = vue générale)"></div>
    <button class="btn primary" id="start">Lancer l'analyse</button></div>`;
  if ($('#autodeep', el)) $('#autodeep', el).onchange = (e) => { $('#focusrow', el).hidden = !e.target.checked; };
  if ($('#deep', el)) $('#deep', el).onchange = (e) => { $('#ghidrarow', el).hidden = !e.target.checked; };
  $('#start', el).onclick = () => startAnalysis(target, {
    deep: !!$('#deep', el)?.checked,
    ghidraMin: Number($('#ghidramin', el)?.value) || undefined,
    autoDeep: !!$('#autodeep', el)?.checked,
    deepFocus: $('#deepfocus0', el)?.value || '',
  });
}

async function startAnalysis(target, options = {}) {
  try {
    const { icon, ...t } = target;
    const a = await api('/analyses', { body: { target: { ...t, icon: icon || null }, options } });
    location.hash = `#/analyse/${a.id}`;
    refreshSidebar();
  } catch (e) { toast(e.message); }
}

// ---------- Historique
async function renderHistory() {
  state.current = null; setNav('history');
  const list = await api('/analyses');
  main.innerHTML = `<div class="page"><h1>Historique</h1><p class="lead">${list.length} analyse(s)</p>
    <div class="list">${list.map((a) => `
      <a href="#/analyse/${a.id}"><span style="font-size:20px">${KIND[a.target.kind]?.[0] || ''}</span>
      <span class="t"><b>${esc(a.target.name || a.target.url)}</b><small>${esc(a.target.url || a.target.exe || a.target.path)}</small></span>
      ${kindBadge(a.target.kind)}<span class="badge ${a.status === 'done' ? 'ok' : a.status === 'error' ? 'err' : 'warn'}">${statusLabel[a.status]}</span>
      <span class="muted small">${fmtDate(a.createdAt)}</span></a>`).join('') || '<div class="empty">Aucune analyse.</div>'}</div></div>`;
}

// ---------- Page d'analyse
const openSteps = new Set();
async function renderAnalysis(id) {
  state.current = id; setNav(null);
  let a;
  try { a = await api(`/analyses/${id}`); } catch (e) { main.innerHTML = `<div class="page"><h1>Introuvable</h1><p>${esc(e.message)}</p></div>`; return; }
  const t = a.target;
  const claudeOk = state.status?.claude?.ok;
  const analysisDone = a.status === 'done' || a.status === 'error';
  main.innerHTML = `<div class="page">
    <div class="head">
      ${t.icon ? `<img class="icon" src="data:image/png;base64,${t.icon}" alt="">` : `<span class="icon">${KIND[t.kind]?.[0] || '🔬'}</span>`}
      <div style="flex:1;min-width:0"><h1>${esc(t.name || t.url)}</h1>
        <div class="row">${kindBadge(t.kind)}<span class="badge ${a.status === 'done' ? 'ok' : a.status === 'error' ? 'err' : 'warn'}" id="astatus">${statusLabel[a.status]}</span></div></div>
      <button class="btn" id="rerun" title="Refait l'analyse REA sur cette même page (le plan, l'enquête et les projets sont conservés)" ${a.status === 'running' || a.status === 'queued' ? 'disabled' : ''}>↻ Relancer l'analyse</button>
      <button class="btn" id="folder">📂 Dossier</button>
      <button class="btn ghost danger" id="del" title="Supprimer l'analyse">🗑</button>
    </div>
    <dl class="props">
      <dt>Cible</dt><dd>${esc(t.url || t.exe || t.path)}</dd>
      ${t.company ? `<dt>Éditeur</dt><dd>${esc(t.company)} ${esc(t.version || '')}</dd>` : ''}
      <dt>Lancée le</dt><dd>${fmtDate(a.createdAt)}${a.rerunAt ? ` · relancée le ${fmtDate(a.rerunAt)}` : ''}</dd>
      ${a.snapshot ? '<dt>Sauvegarde Ghidra</dt><dd>✓ Disponible : une nouvelle analyse de ce fichier rechargera les résultats déjà calculés</dd>' : ''}
      ${a.hasEvidence ? '<dt>Preuves REA</dt><dd>✓ preuves-rea.json (dans le dossier de l\'analyse)</dd>' : ''}
      ${a.options?.autoDeep ? '<dt>Ensuite</dt><dd>Enquête automatique avec Claude Code (onglet Enquêtes)</dd>' : ''}
      ${a.options?.deep ? `<dt>Mode</dt><dd>Analyse profonde Ghidra (temps max : ${a.options.ghidraMin ? fmtShort(a.options.ghidraMin * 60) : '2 h'})</dd>` : ''}
    </dl>

    <div class="tabs atabs" role="tablist">
      <button role="tab" data-atab="analyse">🔬 Analyse</button>
      <button role="tab" data-atab="enquetes">🔍 Enquêtes${a.enquetes.length ? ` <span class="count">${a.enquetes.length}</span>` : ''}${a.jobs.deep.running ? ' <span class="spin"></span>' : ''}</button>
      <button role="tab" data-atab="recon">🏗️ Reconstruction${a.plan ? ' <span class="count">✓ plan</span>' : ''}</button>
    </div>

    <section data-apanel="analyse">
      <h2>Analyse REA ${help(HELP.analyse)} <span id="eta" style="font-size:13px;font-weight:400"></span></h2>
      <div class="steps" id="steps"></div>
      <div class="callout info" style="margin-top:16px"><span>🔍</span><div class="small">Pour comprendre une fonctionnalité précise (« comment marche la recherche ? »), ouvrez l'onglet <a href="#" data-goto="enquetes" style="color:var(--accent)">Enquêtes</a>. Pour créer votre version de l'appli, ouvrez l'onglet <a href="#" data-goto="recon" style="color:var(--accent)">Reconstruction</a>.</div></div>
    </section>

    <section data-apanel="enquetes"><div id="enquetes"></div></section>

    <section data-apanel="recon">
      <h2><span class="num">1</span> Plan de reconstruction ${help(HELP.plan)} <span id="t-plan" style="font-size:13px;font-weight:400">${jobTimer('plan', a.jobs.plan)}</span></h2>
      <div id="plan"></div>

      <h2><span class="num">2</span> Reconstruire avec Claude Code ${help(HELP.build)} <span id="t-build" style="font-size:13px;font-weight:400">${jobTimer('build', a.jobs.build)}</span></h2>
      <div id="build"></div>

      <h2><span class="num">3</span> Faire évoluer le projet ${help(HELP.change)} <span id="t-change" style="font-size:13px;font-weight:400">${jobTimer('change', a.jobs.change)}</span></h2>
      <div id="change"></div>
    </section>
  </div>`;
  const tab = state.atab?.[id] || 'analyse';
  const showTab = (t) => {
    (state.atab ||= {})[id] = t;
    main.querySelectorAll('[data-atab]').forEach((b) => { b.classList.toggle('active', b.dataset.atab === t); b.setAttribute('aria-selected', b.dataset.atab === t); });
    main.querySelectorAll('[data-apanel]').forEach((p) => { p.hidden = p.dataset.apanel !== t; });
  };
  main.querySelectorAll('[data-atab]').forEach((b) => b.onclick = () => showTab(b.dataset.atab));
  main.querySelectorAll('[data-goto]').forEach((l) => l.onclick = (e) => { e.preventDefault(); showTab(l.dataset.goto); });
  showTab(tab);
  $('#rerun').onclick = async () => {
    try { await api(`/analyses/${id}/rerun`, { body: {} }); openSteps.clear(); renderAnalysis(id); refreshSidebar(); } catch (e) { toast(e.message); }
  };
  $('#folder').onclick = () => api('/open-folder', { body: { path: a.dir } }).catch((e) => toast(e.message));
  $('#del').onclick = async () => {
    if (!confirm('Supprimer cette analyse et ses résultats ?')) return;
    await api(`/analyses/${id}`, { method: 'DELETE' }); refreshSidebar(); location.hash = '#/';
  };
  renderSteps(a);
  renderEnquetes(a, analysisDone, claudeOk);
  renderPlan(a, analysisDone, claudeOk);
  renderBuild(a, claudeOk);
  renderChange(a, claudeOk);
}

function renderSteps(a) {
  const box = $('#steps'); if (!box) return;
  const rem = (a.status === 'running' || a.status === 'queued') ? remainingEst(a.steps) : null;
  const eta = $('#eta');
  if (eta) eta.innerHTML = rem ? `<span class="badge warn">⏱ Temps restant estimé : ${rem[1] < 60 ? 'moins d\'une minute' : `${fmtShort(rem[0])} à ${fmtShort(rem[1])}`}</span>` : '';
  const timeCell = (s) => s.status === 'running' && s.startedAt
    ? `<span class="small" style="color:var(--orange)"><span data-started="${s.startedAt}">${fmtElapsed(Date.now() - s.startedAt)}</span>${s.est ? ` / ${fmtEst(s.est)}` : ''}</span>`
    : s.status === 'pending' || s.status === 'waiting' ? `<span class="muted small">${s.status === 'waiting' ? 'en attente · ' : ''}${fmtEst(s.est)}</span>`
    : `<span class="muted small">${fmtDur(s.durationMs)} ${fmtBytes(s.bytes)}</span>`;
  box.innerHTML = a.steps.map((s) => `
    <div class="step" data-step="${s.id}">
      <div class="step-h"><span class="st">${statusIcon(s.status)}</span>
        <span class="lbl">${esc(s.label)} ${help(HELP.steps[s.id === 'open' && !s.tool ? 'open-web' : s.id])}<small>${esc(s.error ? 'Erreur : ' + s.error : s.waiting ? s.waiting : s.summary || (s.status === 'running' ? (s.progress?.message || s.note || 'En cours…') : (s.note || '')))}</small></span>
        ${s.tool ? `<code>${s.tool}</code>` : ''}${timeCell(s)}</div>
      <div class="step-b" ${openSteps.has(s.id) ? '' : 'hidden'}></div>
    </div>`).join('');
  box.querySelectorAll('.step').forEach((el) => {
    const s = a.steps.find((x) => x.id === el.dataset.step);
    const body = $('.step-b', el);
    const load = async () => {
      body.innerHTML = '<span class="spin"></span>';
      let html = (s.images || []).map((n) => `<img src="/api/analyses/${a.id}/file/${n}" alt="">`).join('');
      if (s.error) html += `<p class="err-text">${esc(s.error)}</p>`;
      if (/OutOfMemoryError|heap space/i.test(s.error || '')) html += `<div class="callout warn"><span>💡</span><div class="small">Ghidra a manqué de mémoire. FREE lui donne maintenant plus de mémoire automatiquement (environ 60 % de la RAM du PC) : quittez FREE avec le bouton, relancez-le, puis cliquez sur « Relancer l'analyse ». Fermer les gros programmes (jeux, navigateur avec beaucoup d'onglets) aide aussi.</div></div>`;
      if (s.tool && (s.status === 'done' || s.status === 'error')) {
        const r = await api(`/analyses/${a.id}/steps/${s.id}`).catch(() => null);
        if (r) html += `<div class="json">${r.data != null ? jsonView(r.data) : esc(r.text || '')}</div>`;
      }
      body.innerHTML = html || '<span class="muted small">Pas encore de résultat.</span>';
    };
    if (openSteps.has(s.id)) load();
    $('.step-h', el).onclick = () => {
      body.hidden = !body.hidden;
      if (body.hidden) openSteps.delete(s.id); else { openSteps.add(s.id); load(); }
    };
  });
}

function logEntryHtml(e) {
  // Claude Code installe mais pas connecte : explication en francais
  if (e.t === 'result' && !e.ok && /not logged in|\/login/i.test(e.text || '')) {
    return `<div class="e result bad">❌ Claude Code n'est pas connecté à votre compte.

Pour corriger : ouvrez un terminal (PowerShell), tapez <b>claude</b>, puis dans Claude Code tapez <b>/login</b> et suivez les instructions dans le navigateur. Revenez ensuite ici et relancez (inutile de redémarrer FREE).</div>`;
  }
  switch (e.t) {
    case 'text': return `<div class="e">${esc(e.text)}</div>`;
    case 'tool': return `<div class="e tool">🔧 <b>${esc(e.name)}</b> ${esc(e.detail || '')}</div>`;
    case 'stderr': return `<div class="e stderr">${esc(e.text)}</div>`;
    case 'error': return `<div class="e error">${esc(e.text)}</div>`;
    case 'info': return `<div class="e info">${esc(e.text)}</div>`;
    case 'user': return `<div class="e user">🙋 ${esc(e.text)}</div>`;
    case 'start': return `<div class="e info">▶ Claude Code démarre dans ${esc(e.cwd)}</div>`;
    case 'result': return `<div class="e result ${e.ok ? '' : 'bad'}">${e.ok ? '✅ Terminé' : '❌ Échec'}${e.durationMs ? ` en ${fmtDur(e.durationMs)}` : ''}${e.cost ? ` · ${e.cost.toFixed(2)} $` : ''}${e.text ? '\n\n' + esc(e.text) : ''}</div>`;
    case 'end': return e.code ? `<div class="e error">Claude Code s'est arrêté (code ${e.code}).</div>` : '';
    default: return '';
  }
}

const ENQ_SUGGESTIONS = [
  'Vue générale : comment l\'appli fonctionne dans son ensemble',
  'Comment marche la sauvegarde des données ?',
  'Quelles informations sont envoyées sur Internet, et à qui ?',
  'Comment est construite l\'interface (fenêtres, menus, écrans) ?',
  'Comment marche la recherche ?',
];
function renderEnquetes(a, analysisDone, claudeOk) {
  const box = $('#enquetes'); if (!box) return;
  const busy = a.jobs.deep.running;
  const disabled = !analysisDone || !claudeOk || busy;
  const reason = !claudeOk ? 'Claude Code n\'est pas détecté.' : !analysisDone ? 'Disponible à la fin de l\'analyse.' : busy ? 'Une enquête est en cours : la suivante pourra démarrer ensuite.' : '';
  const card = (e) => {
    const running = busy && e.log?.length && !e.log.some((x) => x.t === 'end');
    const ended = e.log?.find((x) => x.t === 'result');
    const status = running ? '<span class="badge warn"><span class="spin"></span> en cours</span>' : e.md ? '<span class="badge ok">terminée</span>' : ended ? '<span class="badge err">sans réponse</span>' : e.legacy ? '<span class="badge ok">terminée</span>' : '<span class="badge">interrompue</span>';
    const open = state.openEnq?.[e.id] ?? running;
    return `<div class="card enq" data-eid="${e.id}">
      <div class="row"><b class="grow">${e.question ? '❓ ' : '🧭 '}${esc(e.title)}</b>${running ? jobTimer('deep', { running: true, log: e.log }) : ''}${status}
        <span class="muted small">${fmtDate(e.createdAt)}</span>
        ${running ? `<button class="btn" data-stop>Arrêter</button>` : `<button class="btn ghost danger small" data-del title="Supprimer cette enquête">🗑</button>`}</div>
      ${e.md ? `<div class="md ${open ? '' : 'folded'}" style="margin-top:10px" data-md>${md(e.md)}</div>
        <button class="btn ghost small" data-fold style="margin-top:4px">${open ? '▴ Réduire' : '▾ Lire toute la réponse'}</button>`
        : running ? '<p class="muted small" style="margin:8px 0 0">Claude Code fouille… La réponse s\'écrit ici au fur et à mesure qu\'il trouve.</p>' : ''}
      ${e.log?.length ? `<details ${running ? 'open' : ''} style="margin-top:8px"><summary class="muted small" style="cursor:pointer">Journal de Claude Code</summary><div class="log" id="enqlog-${e.id}">${e.log.map(logEntryHtml).join('')}</div></details>` : ''}
    </div>`;
  };
  box.innerHTML = `
    <h2>Enquêtes ${help(HELP.deep)} <span style="font-size:13px;font-weight:400">${jobTimer('deep', { running: false })}</span></h2>
    <p class="muted">Posez une question sur une fonctionnalité de l'appli : Claude Code fouille avec les ~260 outils REA (décompile, suit les textes et les appels) et vous répond avec les preuves. Chaque question garde sa fiche, et le plan de reconstruction les utilise toutes.</p>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <textarea id="enqq" class="grow" rows="2" placeholder="Quelle fonctionnalité voulez-vous comprendre ? (laisser vide pour une vue générale)" ${disabled ? 'disabled' : ''}></textarea>
        <button class="btn primary" id="enqgo" ${disabled ? 'disabled' : ''}>🔍 Enquêter</button>
      </div>
      <div class="chips">${ENQ_SUGGESTIONS.map((t, i) => `<button class="chip" type="button" data-sugg="${i}">${esc(t)}</button>`).join('')}</div>
      ${reason ? `<p class="muted small" style="margin:6px 0 0">${reason}</p>` : '<p class="muted small" style="margin:6px 0 0">Entrée pour lancer. Une enquête à la fois : elles partagent le programme chargé dans Ghidra.</p>'}
    </div>
    <div style="display:grid;gap:10px;margin-top:14px">${a.enquetes.map(card).join('') || '<div class="empty">Aucune enquête pour l\'instant. Posez votre première question ci-dessus.</div>'}</div>`;
  const go = async () => {
    const q = $('#enqq').value.trim();
    try { await api(`/analyses/${a.id}/deep`, { body: { focus: q.startsWith('Vue générale') ? '' : q } }); renderAnalysis(a.id); } catch (e) { toast(e.message); }
  };
  $('#enqgo').onclick = go;
  $('#enqq').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
  box.querySelectorAll('[data-sugg]').forEach((c) => c.onclick = () => { const t = $('#enqq'); if (t.disabled) return; t.value = ENQ_SUGGESTIONS[c.dataset.sugg]; t.focus(); });
  box.querySelectorAll('.enq').forEach((el) => {
    const eid = el.dataset.eid;
    $('[data-fold]', el)?.addEventListener('click', () => {
      const m = $('[data-md]', el); const open = m.classList.toggle('folded') === false;
      (state.openEnq ||= {})[eid] = open; $('[data-fold]', el).textContent = open ? '▴ Réduire' : '▾ Lire toute la réponse';
    });
    $('[data-del]', el)?.addEventListener('click', async () => {
      if (!confirm('Supprimer cette enquête ?')) return;
      await api(`/analyses/${a.id}/enquetes/${eid}`, { method: 'DELETE' }); renderAnalysis(a.id);
    });
    $('[data-stop]', el)?.addEventListener('click', () => api('/jobs/stop', { body: { jobId: `${a.id}:deep` } }));
    const log = $(`#enqlog-${eid}`); if (log) log.scrollTop = log.scrollHeight;
  });
}

function renderPlan(a, analysisDone, claudeOk) {
  const box = $('#plan'); if (!box) return;
  const job = a.jobs.plan;
  const noClaude = !claudeOk ? `<div class="callout warn"><span>⚠️</span><div class="small">Claude Code est introuvable sur ce PC. Installez-le (voir <a href="https://docs.claude.com/en/docs/claude-code/setup" target="_blank" style="color:var(--accent)">la documentation</a>), connectez-vous avec <code>claude</code> dans un terminal, puis redémarrez FREE.</div></div>` : '';
  if (a.plan && !job.running) {
    box.innerHTML = `${noClaude}<div class="card"><div class="row" style="margin-bottom:6px"><span class="badge ok">PLAN.md</span><span class="grow"></span>
      <button class="btn" id="editplan">✏️ Modifier</button><button class="btn" id="regen" ${claudeOk ? '' : 'disabled'}>↻ Régénérer</button></div>
      <div class="md ${state.planOpen ? '' : 'folded'}" id="planview">${md(a.plan)}</div>
      <button class="btn ghost small" id="planfold" style="margin-top:6px">${state.planOpen ? '▴ Réduire le plan' : '▾ Afficher tout le plan'}</button></div>
      <details style="margin-top:8px"><summary class="muted small" style="cursor:pointer">Journal de Claude Code</summary><div class="log" id="planlog">${job.log.map(logEntryHtml).join('')}</div></details>`;
    $('#planfold').onclick = () => {
      state.planOpen = !state.planOpen;
      $('#planview').classList.toggle('folded', !state.planOpen);
      $('#planfold').textContent = state.planOpen ? '▴ Réduire le plan' : '▾ Afficher tout le plan';
      if (!state.planOpen) $('#plan').scrollIntoView({ block: 'nearest' });
    };
    $('#editplan').onclick = () => {
      $('#planview').classList.remove('folded'); $('#planfold').hidden = true;
      $('#planview').innerHTML = `<textarea id="plantext" style="min-height:420px;font-family:var(--mono);font-size:12.5px">${esc(a.plan)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn primary" id="saveplan">Enregistrer</button><button class="btn" id="cancelplan">Annuler</button></div>`;
      $('#saveplan').onclick = async () => { await api(`/analyses/${a.id}/plan`, { method: 'PUT', body: { plan: $('#plantext').value } }); toast('Plan enregistré'); renderAnalysis(a.id); };
      $('#cancelplan').onclick = () => renderAnalysis(a.id);
    };
    $('#regen').onclick = () => { a.plan = null; renderPlan(a, analysisDone, claudeOk); };
    return;
  }
  box.innerHTML = `${noClaude}
    <p class="muted">Claude Code lit les résultats de l'analyse et écrit un plan : fonctionnalités, architecture, inconnues, stack et étapes de reconstruction. Vous pourrez le relire et le modifier avant de lancer la construction.</p>
    <textarea id="planextra" placeholder="Consignes facultatives (ex. : je veux une version web en React, me concentrer sur la recherche…)" ${job.running ? 'disabled' : ''}></textarea>
    <div class="row" style="margin:8px 0">
      <button class="btn primary" id="genplan" ${(!analysisDone || !claudeOk || job.running) ? 'disabled' : ''}>${job.running ? '<span class="spin"></span> Génération du plan…' : '✨ Générer le plan avec Claude Code'}</button>
      ${job.running ? `<button class="btn" id="stopplan">Arreter</button>` : ''}
      ${!analysisDone ? '<span class="muted small">Disponible à la fin de l\'analyse.</span>' : ''}
    </div>
    <div class="log" id="planlog">${job.log.map(logEntryHtml).join('')}</div>`;
  $('#genplan').onclick = async () => {
    try { await api(`/analyses/${a.id}/plan`, { body: { instructions: $('#planextra').value } }); renderAnalysis(a.id); } catch (e) { toast(e.message); }
  };
  if ($('#stopplan')) $('#stopplan').onclick = () => api('/jobs/stop', { body: { jobId: `${a.id}:plan` } });
  const log = $('#planlog'); log.scrollTop = log.scrollHeight;
}

function renderBuild(a, claudeOk) {
  const box = $('#build'); if (!box) return;
  const job = a.jobs.build;
  const projects = (a.projects || []).map((p) => `<div class="row" style="margin:4px 0"><span>📁</span><code class="grow" style="overflow-wrap:anywhere">${esc(p.dir)}</code><button class="btn" data-open="${esc(p.dir)}">Ouvrir</button></div>`).join('');
  box.innerHTML = !a.plan ? `<p class="muted">Générez d'abord le plan (étape 1).</p>` : `
    <p class="muted">Claude Code crée un nouveau projet dans <code>${esc(state.status?.paths?.projects || 'REA-Projets')}</code>, suit le plan, installe les dépendances et vérifie que le projet démarre.</p>
    <div class="row" style="margin-bottom:8px"><input id="pname" type="text" class="grow" placeholder="Nom du projet" value="${esc((a.target.name || 'projet') + '-reconstruit')}" ${job.running ? 'disabled' : ''}></div>
    <textarea id="bextra" placeholder="Consignes facultatives pour la construction" ${job.running ? 'disabled' : ''}></textarea>
    <div class="row" style="margin:8px 0">
      <button class="btn primary" id="gobuild" ${(!claudeOk || job.running) ? 'disabled' : ''}>${job.running ? '<span class="spin"></span> Construction en cours…' : '🏗️ Reconstruire avec Claude Code'}</button>
      ${job.running ? `<button class="btn" id="stopbuild">Arreter</button>` : ''}
    </div>
    ${projects ? `<h3>Projets créés</h3>${projects}` : ''}
    <div class="log" id="buildlog" style="margin-top:10px">${job.log.map(logEntryHtml).join('')}</div>`;
  if (!a.plan) return;
  $('#gobuild').onclick = async () => {
    try { const r = await api(`/analyses/${a.id}/build`, { body: { projectName: $('#pname').value, instructions: $('#bextra').value } }); toast('Projet : ' + r.dir); renderAnalysis(a.id); } catch (e) { toast(e.message); }
  };
  if ($('#stopbuild')) $('#stopbuild').onclick = () => api('/jobs/stop', { body: { jobId: `${a.id}:build` } });
  box.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => api('/open-folder', { body: { path: b.dataset.open } }).catch((e) => toast(e.message)));
  const log = $('#buildlog'); log.scrollTop = log.scrollHeight;
}

// ---------- Demandes libres sur le projet reconstruit
const SUGGESTIONS = [
  'Passe l\'interface en thème sombre',
  'Change les couleurs pour un style plus moderne',
  'Ajoute une fonctionnalité : ',
  'Explique-moi comment fonctionne ',
  'Corrige ce bug : ',
  'Comment je lance le projet ?',
];
function renderChange(a, claudeOk) {
  const box = $('#change'); if (!box) return;
  const projects = a.projects || [];
  if (!projects.length) { box.innerHTML = '<p class="muted">Reconstruisez d\'abord le projet (étape 2). Vous pourrez ensuite demander ce que vous voulez : changer le thème, ajouter des fonctions, poser des questions…</p>'; return; }
  const job = a.jobs.change;
  const busy = job.running || a.jobs.build.running;
  const sel = state.changeProject && projects.some((p) => p.dir === state.changeProject) ? state.changeProject : projects.at(-1).dir;
  state.changeProject = sel;
  box.innerHTML = `
    <p class="muted">Dites à Claude Code ce que vous voulez : il modifie le projet reconstruit, vérifie qu'il marche toujours et vous résume ce qu'il a fait. Il se souvient de la conversation.</p>
    ${projects.length > 1 ? `<div class="row" style="margin-bottom:8px"><span class="muted small">Projet :</span><select id="cproj" class="grow">${projects.map((p) => `<option value="${esc(p.dir)}" ${p.dir === sel ? 'selected' : ''}>${esc(p.dir)}</option>`).join('')}</select></div>` : ''}
    <div class="log chat" id="changelog">${job.log.filter((e) => !e.project || e.project === sel).map(logEntryHtml).join('')}</div>
    <div class="chips">${SUGGESTIONS.map((t) => `<button class="chip" type="button">${esc(t)}</button>`).join('')}</div>
    <div class="row" style="align-items:flex-end">
      <textarea id="cmsg" class="grow" rows="2" placeholder="Ex. : passe en thème sombre et ajoute un bouton pour exporter en PDF" ${busy || !claudeOk ? 'disabled' : ''}></textarea>
      <button class="btn primary" id="csend" ${busy || !claudeOk ? 'disabled' : ''}>${job.running ? '<span class="spin"></span>' : 'Envoyer'}</button>
      ${job.running ? '<button class="btn" id="cstop">Arrêter</button>' : ''}
    </div>
    <p class="muted small">Entrée pour envoyer, Maj+Entrée pour aller à la ligne.</p>`;
  if ($('#cproj')) $('#cproj').onchange = (e) => { state.changeProject = e.target.value; renderChange(a, claudeOk); };
  box.querySelectorAll('.chip').forEach((c) => c.onclick = () => { const t = $('#cmsg'); if (t.disabled) return; t.value = c.textContent; t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
  const send = async () => {
    const message = $('#cmsg').value.trim(); if (!message) return;
    try { await api(`/analyses/${a.id}/change`, { body: { projectDir: sel, message } }); renderAnalysis(a.id); } catch (e) { toast(e.message); }
  };
  $('#csend').onclick = send;
  $('#cmsg').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  if ($('#cstop')) $('#cstop').onclick = () => api('/jobs/stop', { body: { jobId: `${a.id}:change` } });
  const log = $('#changelog'); log.scrollTop = log.scrollHeight;
}

// ---------- Catalogue des outils
const FIELD_FR = {
  path: 'Chemin du fichier', input_path: "Chemin de l'appli", cdp_endpoint: 'Adresse du navigateur (CDP)', target_id: 'Onglet à analyser',
  detail: 'Niveau de detail', procedure: 'Fonction (nom ou adresse)', address: 'Adresse', document: 'Document', query: 'Recherche', pattern: 'Motif',
  allowed_origins: 'Origines autorisees (une par ligne)', provider_id: 'Moteur', action: 'Action', workflow_id: 'Méthode', arguments: 'Arguments (JSON)',
  observation_ms: "Durée d'observation (ms)", source: 'Source (JSON)', view: 'Vue (JSON)', seed: 'Point de depart (JSON)', application: 'Graphe applicatif (JSON)',
  left_path: 'Fichier de gauche', right_path: 'Fichier de droite', name: 'Nom', value: 'Valeur', comment: 'Commentaire', limit: 'Limite', offset: 'Décalage',
};
const humanize = (k) => FIELD_FR[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '));

async function renderTools(selected) {
  state.current = null; setNav('tools');
  main.innerHTML = `<div class="page wide"><h1>Tous les outils</h1><p class="lead">Les outils de REA, renommés en français. Choisissez-en un, remplissez le formulaire et lancez-le.</p>
    <div class="tools"><div><input id="tsearch" type="text" placeholder="🔎 Chercher un outil…" style="margin-bottom:8px"><div class="tool-list" id="tlist"><div style="padding:12px" class="muted">Chargement…</div></div></div>
    <div id="tpanel"><div class="empty">Choisissez un outil dans la liste.</div></div></div></div>`;
  try { if (!state.tools) state.tools = await api('/tools'); } catch (e) { $('#tlist').innerHTML = `<div style="padding:12px" class="err-text">${esc(e.message)}</div>`; return; }
  const draw = () => {
    const q = $('#tsearch').value.toLowerCase();
    const match = (t) => !q || t.label.toLowerCase().includes(q) || t.name.includes(q) || (t.desc || '').toLowerCase().includes(q);
    $('#tlist').innerHTML = state.tools.categories.map((c) => {
      const ts = state.tools.tools.filter((t) => t.category === c.id && match(t)).sort((a, b) => (b.featured - a.featured) || a.label.localeCompare(b.label));
      if (!ts.length) return '';
      return `<div class="cat">${c.icon} ${c.label} <span class="z">(${ts.length})</span></div>` +
        ts.map((t) => `<a href="#/outils/${t.name}" class="${t.name === selected ? 'active' : ''}">${t.featured ? '' : '<span class="muted">·</span> '}${esc(t.label)}<small>${t.name}</small></a>`).join('');
    }).join('') || '<div style="padding:12px" class="muted">Aucun outil.</div>';
  };
  $('#tsearch').oninput = draw;
  draw();
  if (selected) renderToolPanel(state.tools.tools.find((t) => t.name === selected));
}

function fieldHtml(key, schema, required) {
  const id = `f_${key}`;
  const req = required ? ' <span class="req">*</span>' : '';
  const hint = schema.description ? `<div class="hint">${esc(schema.description.slice(0, 300))}</div>` : '';
  let input;
  if (schema.enum) input = `<select id="${id}"><option value="">(par défaut)</option>${schema.enum.map((v) => `<option>${esc(v)}</option>`).join('')}</select>`;
  else if (schema.type === 'boolean') input = `<select id="${id}"><option value="">(par défaut)</option><option value="true">Oui</option><option value="false">Non</option></select>`;
  else if (schema.type === 'integer' || schema.type === 'number') input = `<input id="${id}" type="number" ${schema.minimum != null ? `min="${schema.minimum}"` : ''}>`;
  else if (schema.type === 'array' && (schema.items?.type === 'string' || !schema.items)) input = `<textarea id="${id}" rows="2" placeholder="Une valeur par ligne"></textarea>`;
  else if (schema.type === 'string' || (!schema.type && !schema.properties)) {
    if (key === 'target_id') input = `<div class="row"><select id="${id}" class="grow"><option value="">Choisir un onglet…</option></select><button class="btn" type="button" id="loadtabs">↻</button></div>`;
    else input = `<input id="${id}" type="text" ${key === 'cdp_endpoint' ? 'value="http://127.0.0.1:9333"' : ''}>`;
  } else input = `<textarea id="${id}" rows="3" placeholder="JSON">${schema.type === 'array' ? '[]' : ''}</textarea>`;
  return `<div class="field"><label for="${id}">${esc(humanize(key))}${req} <code class="muted" style="font-size:11px;font-weight:400">${key}</code></label>${input}${hint}</div>`;
}

function readField(key, schema) {
  const el = $(`#f_${key}`); if (!el) return undefined;
  const v = el.value.trim();
  if (v === '') return undefined;
  if (schema.type === 'boolean') return v === 'true';
  if (schema.type === 'integer' || schema.type === 'number') return Number(v);
  if (schema.enum || schema.type === 'string' || (!schema.type && !schema.properties && el.tagName !== 'TEXTAREA')) return v;
  if (schema.type === 'array' && (schema.items?.type === 'string' || !schema.items)) return v.split('\n').map((x) => x.trim()).filter(Boolean);
  try { return JSON.parse(v); } catch { throw new Error(`Le champ « ${humanize(key)} » doit contenir du JSON valide.`); }
}

function renderToolPanel(t) {
  const box = $('#tpanel'); if (!t) { box.innerHTML = '<div class="empty">Outil introuvable.</div>'; return; }
  const props = t.inputSchema.properties || {};
  const required = new Set(t.inputSchema.required || []);
  const keys = Object.keys(props).sort((a, b) => required.has(b) - required.has(a));
  box.innerHTML = `<div class="card">
    <h2 style="margin-top:0">${esc(t.label)}</h2>
    <code class="muted">${t.name}</code> ${t.destructive ? '<span class="badge err">modifie quelque chose</span>' : ''}
    ${t.desc ? `<p>${esc(t.desc)}</p>` : ''}
    <details class="orig" ${t.desc ? '' : 'open'}><summary>Description d'origine (anglais)</summary><p>${esc(t.original)}</p></details>
    <form id="tform">${keys.map((k) => fieldHtml(k, props[k], required.has(k))).join('') || '<p class="muted">Aucun parametre.</p>'}
    <button class="btn primary" type="submit" id="trun">▶ Lancer</button></form></div>
    <div id="tresult" style="margin-top:16px"></div>`;
  const loadTabs = async () => {
    const sel = $('#f_target_id'); if (!sel) return;
    const tabs = await api('/tabs').catch(() => []);
    sel.innerHTML = `<option value="">${tabs.length ? 'Choisir un onglet…' : 'Aucun onglet (lancez une analyse web d\'abord)'}</option>` + tabs.map((x) => `<option value="${x.id}">${esc(x.title || x.url)}</option>`).join('');
  };
  if ($('#loadtabs')) { $('#loadtabs').onclick = loadTabs; loadTabs(); }
  $('#tform').onsubmit = async (e) => {
    e.preventDefault();
    const args = {};
    try { for (const k of keys) { const v = readField(k, props[k]); if (v !== undefined) args[k] = v; } } catch (err) { toast(err.message); return; }
    const missing = [...required].filter((k) => args[k] === undefined);
    if (missing.length) { toast('Champs obligatoires : ' + missing.map(humanize).join(', ')); return; }
    $('#trun').disabled = true; $('#trun').innerHTML = '<span class="spin"></span> En cours…';
    const t0 = Date.now();
    try {
      const r = await api(`/tools/${t.name}`, { body: args });
      $('#tresult').innerHTML = `<div class="row" style="margin-bottom:6px"><span class="badge ${r.ok ? 'ok' : 'err'}">${r.ok ? 'Succès' : 'Erreur'}</span><span class="muted small">${fmtDur(Date.now() - t0)}</span><span class="grow"></span><button class="btn" id="copyres">Copier le JSON</button></div>
        ${(r.images || []).map((src) => `<img src="${src}" style="max-width:100%;border:1px solid var(--line);border-radius:6px">`).join('')}
        <div class="json">${r.data != null ? jsonView(r.data) : esc(r.text)}</div>`;
      $('#copyres').onclick = () => { navigator.clipboard.writeText(JSON.stringify(r.data ?? r.text, null, 2)); toast('Copie'); };
    } catch (err) { $('#tresult').innerHTML = `<p class="err-text">${esc(err.message)}</p>`; }
    $('#trun').disabled = false; $('#trun').innerHTML = '▶ Lancer';
  };
}

// ---------- Routeur
async function route() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [, page, arg] = h.split('/');
  if (page === 'analyse' && arg) await renderAnalysis(arg);
  else if (page === 'historique') await renderHistory();
  else if (page === 'outils') {
    if (state.current === null && $('#tlist') && arg) { renderToolPanel(state.tools?.tools.find((t) => t.name === arg)); document.querySelectorAll('#tlist a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#/outils/${arg}`)); }
    else await renderTools(arg);
  }
  else await renderHome();
}
window.addEventListener('hashchange', route);

// ---------- Evenements temps reel
const es = new EventSource('/api/events');
let sideTimer;
es.onmessage = (msg) => {
  const ev = JSON.parse(msg.data);
  if (ev.type === 'analysis') {
    clearTimeout(sideTimer); sideTimer = setTimeout(refreshSidebar, 300);
    if (ev.id === state.current) {
      renderSteps({ ...ev.meta, id: ev.id });
      const b = $('#astatus');
      if (b) { b.textContent = statusLabel[ev.meta.status]; b.className = `badge ${ev.meta.status === 'done' ? 'ok' : ev.meta.status === 'error' ? 'err' : 'warn'}`; }
      if (!ev.progress && (ev.meta.status === 'done' || ev.meta.status === 'error') && $('#genplan')?.disabled && !$('#planlog')?.children.length) renderAnalysis(ev.id);
    }
  } else if (ev.type === 'claude' && ev.analysisId === state.current) {
    const log = ev.kind.startsWith('enquete-') ? $(`#enqlog-${ev.kind.slice(8)}`) : $({ plan: '#planlog', build: '#buildlog', change: '#changelog' }[ev.kind]);
    if (ev.kind === 'change' && ev.entry.project && ev.entry.project !== state.changeProject) return;
    if (log) { log.insertAdjacentHTML('beforeend', logEntryHtml(ev.entry)); log.scrollTop = log.scrollHeight; }
    if (ev.entry.t === 'end' || ev.entry.t === 'start') setTimeout(() => renderAnalysis(ev.analysisId), 400);
  }
};

loadUpdates().then(refreshStatus);
setTimeout(() => loadUpdates().then(refreshStatus), 20000); // la 1re verification se fait quelques secondes apres le demarrage
Promise.all([refreshStatus(), api('/settings').then((s) => { state.settings = s; }).catch(() => {})]).then(() => { route(); maybeClaudeSetup(); });
setInterval(() => loadUpdates().then(refreshStatus), 30 * 60000);
refreshSidebar();
setInterval(refreshStatus, 60000);
