// Catalogue des outils REA : noms et descriptions en francais, categories.
// Les outils absents de OVERRIDES recoivent un nom traduit automatiquement mot a mot.

export const CATEGORIES = [
  { id: 'web', label: 'Sites web', icon: '🌐' },
  { id: 'js', label: 'JavaScript et Electron', icon: '🧩' },
  { id: 'windows', label: 'Fichiers Windows (.exe, .dll)', icon: '🪟' },
  { id: 'native', label: 'Code machine (Ghidra)', icon: '🔬' },
  { id: 'formats', label: 'Langages et formats', icon: '📦' },
  { id: 'android', label: 'Android', icon: '🤖' },
  { id: 'apple', label: 'Apple (macOS, iOS)', icon: '🍎' },
  { id: 'firmware', label: 'Firmware et système', icon: '🔌' },
  { id: 'runtime', label: 'Observation en direct et débogage', icon: '🎥' },
  { id: 'compare', label: 'Comparaisons', icon: '⚖️' },
  { id: 'build', label: 'Reconstruction et verification', icon: '🏗️' },
  { id: 'session', label: 'Session, preuves et annotations', icon: '🗂️' },
];

const O = (label, desc, cat) => ({ label, desc, cat });
export const OVERRIDES = {
  // Web
  list_browser_targets: O('Lister les onglets du navigateur', "Affiche les pages ouvertes dans un navigateur lance en mode débogage, pour en choisir une.", 'web'),
  inspect_web_page: O('Radiographier une page web', 'Structure HTML, accessibilite, scripts, ressources, requêtes réseau, console et stockage, sans toucher à la page.', 'web'),
  analyze_web_bundle: O('Analyser le code JavaScript du site', 'Retrouve les morceaux de code, les routes, les API appelées et les librairies utilisées.', 'web'),
  capture_web_screenshot: O("Capture d'écran d'une page", 'Prend une image de la partie visible de la page.', 'web'),
  compare_web_screenshots: O("Comparer deux captures d'écran", 'Montre les différences visuelles entre deux captures.', 'compare'),
  inspect_web_network_capture: O('Lire une capture réseau web', 'Detaille les requêtes et réponses enregistrées (HAR, etc.).', 'web'),
  observe_web_session: O('Observer une session web', "Enregistre ce qui se passe sur la page pendant que vous l'utilisez.", 'runtime'),
  observe_web_execution: O("Observer l'execution JavaScript", 'Suit les fonctions JavaScript executees pendant une action.', 'runtime'),
  capture_browser_scenario: O('Enregistrer un scénario navigateur', 'Rejoue et enregistre une suite d\'actions dans le navigateur.', 'runtime'),
  export_web_scripts: O('Exporter les scripts du site', 'Sauvegarde les fichiers JavaScript charges par la page.', 'web'),
  trace_web_module_imports: O('Suivre les imports de modules web', 'Montre quel module JavaScript charge quel autre.', 'web'),
  trace_web_source_location: O('Retrouver le fichier source', 'A partir d\'une position dans le code compile, retrouve le fichier source d\'origine (source maps).', 'web'),
  inspect_web_event_listeners: O('Lister les écouteurs d\'événements', 'Quels clics, saisies et événements la page surveille.', 'web'),
  discover_webmcp_tools: O('Découvrir les outils WebMCP', 'Liste les outils que le site expose aux agents IA.', 'web'),
  compare_web_captures: O('Comparer deux captures web', 'Différences entre deux enregistrements de page.', 'compare'),
  inspect_api_contract: O('Lire un contrat d\'API', 'Analyse une spécification OpenAPI / GraphQL.', 'web'),
  compare_static_and_observed_endpoints: O('Comparer API prévues et observées', 'Croise les endpoints trouvés dans le code et ceux vus sur le réseau.', 'compare'),
  // JS / Electron
  analyze_javascript_application: O("Cartographier une appli JavaScript", "Construit le graphe d'une appli Electron ou Node (fichiers, modules, routes, canaux IPC) sans l'executer.", 'js'),
  inspect_electron_fuses: O('Lire les réglages de sécurité Electron', 'Fuses Electron : inspecteur, mode Node, integrite de l\'ASAR.', 'js'),
  inspect_electron_page: O('Radiographier une fenêtre Electron', 'Comme pour une page web, mais dans une appli Electron lancee en débogage.', 'js'),
  list_electron_targets: O('Lister les fenêtres Electron', 'Fenetres d\'une appli Electron lancee en mode débogage.', 'js'),
  capture_electron_scenario: O('Enregistrer un scénario Electron', 'Enregistre une suite d\'actions dans une appli Electron.', 'runtime'),
  recover_javascript_sources: O('Récupérer les sources JavaScript', 'Reconstitue les fichiers d\'origine grace aux source maps.', 'js'),
  trace_javascript_semantics: O('Suivre la logique JavaScript', 'Suit une valeur ou un appel à travers le code.', 'js'),
  trace_application_feature: O('Suivre une fonctionnalité', 'Part d\'un texte, d\'une route ou d\'un module et suit tout ce qui s\'y rattache dans le graphe de l\'appli.', 'js'),
  trace_feature: O('Enquêter sur une fonctionnalité', 'Relie une fonctionnalité aux fichiers, symboles et fonctions qui l\'implementent.', 'js'),
  observe_javascript_runtime: O('Observer JavaScript en direct', 'Observe une appli JavaScript pendant qu\'elle tourne.', 'runtime'),
  list_javascript_runtime_targets: O('Lister les cibles JavaScript en direct', 'Processus Node/Electron observables.', 'runtime'),
  reconcile_javascript_runtime: O('Croiser code et execution JavaScript', 'Compare ce que dit le code et ce qui a été observe.', 'js'),
  compare_javascript_export_shapes: O('Comparer les exports JavaScript', 'Compare les fonctions exposees par deux versions d\'un module.', 'compare'),
  compare_bundles: O('Comparer deux bundles', 'Différences entre deux versions d\'un code JavaScript compile.', 'compare'),
  compare_source_to_bundle: O('Comparer source et bundle', 'Verifie qu\'un code compile correspond a des sources.', 'compare'),
  inspect_v8_code_cache: O('Lire un cache de code V8', 'Analyse le bytecode V8 mis en cache.', 'js'),
  // Windows
  inspect_desktop_application: O("Identifier la technologie d'une appli", 'Détecte .NET, Unity, Unreal, Godot, Electron... dans un dossier d\'appli et propose la suite.', 'windows'),
  inspect_pe_imports: O('Fonctions Windows utilisées', 'Liste les DLL et fonctions système importees par un .exe ou une .dll.', 'windows'),
  inspect_pe_resources: O('Ressources embarquées', 'Icônes, dialogues, menus, textes et manifestes contenus dans le fichier.', 'windows'),
  inspect_pe_certificates: O('Signature numerique', 'Certificats de signature du fichier.', 'windows'),
  inspect_pe_load_config: O('Configuration de chargement', 'Réglages de sécurité au chargement (CFG, SafeSEH...).', 'windows'),
  inspect_binary_hardening: O('Protections du binaire', 'ASLR, DEP/NX, CFG, protections de pile...', 'windows'),
  inspect_windows_shortcut: O('Lire un raccourci Windows', 'Cible, arguments et dossier d\'un fichier .lnk.', 'windows'),
  inspect_ntfs_journal: O('Lire le journal NTFS', 'Analyse un journal de modifications NTFS ($UsnJrnl).', 'firmware'),
  inspect_managed_artifact: O('Analyser un programme .NET', 'Assemblies, types et métadonnées .NET.', 'formats'),
  inspect_managed_members: O('Lister les classes et méthodes .NET', 'Types, méthodes, champs d\'un programme .NET.', 'formats'),
  inspect_artifact: O('Inventaire d\'un paquet ou archive', 'Liste le contenu d\'une archive, d\'un installeur ou d\'un executable empaquete.', 'formats'),
  extract_artifact: O('Extraire un paquet ou archive', 'Extrait le contenu pour l\'analyser.', 'formats'),
  // Natif / Ghidra
  open_binary: O('Ouvrir un binaire dans Ghidra', 'Charge un .exe/.dll pour l\'analyse profonde (peut prendre plusieurs minutes).', 'native'),
  close_binary: O('Fermer le binaire', 'Libere Ghidra et la mémoire.', 'native'),
  binary_overview: O("Vue d'ensemble du binaire", 'Nombre de fonctions, de textes, segments mémoire.', 'native'),
  binary_session: O('État de la session', 'Quel binaire est ouvert et avec quel moteur.', 'session'),
  list_procedures: O('Lister les fonctions', 'Toutes les fonctions trouvées dans le binaire.', 'native'),
  search_procedures: O('Chercher une fonction', 'Recherche une fonction par nom.', 'native'),
  analyze_function: O('Analyser une fonction', 'Pseudo-code C, assembleur, appels, references et textes d\'une fonction.', 'native'),
  procedure_pseudo_code: O('Pseudo-code d\'une fonction', 'Code C reconstitué par le décompilateur.', 'native'),
  procedure_assembly: O('Assembleur d\'une fonction', 'Instructions machine de la fonction.', 'native'),
  procedure_callers: O('Qui appelle cette fonction', 'Fonctions appelantes.', 'native'),
  procedure_callees: O('Fonctions appelées', 'Fonctions appelées par celle-ci.', 'native'),
  batch_decompile: O('Décompiler plusieurs fonctions', 'Pseudo-code de plusieurs fonctions d\'un coup.', 'native'),
  decompile_all: O('Tout decompiler', 'Pseudo-code de toutes les fonctions (long).', 'native'),
  list_strings: O('Lister les textes', 'Chaînes de caractères trouvées dans le binaire.', 'native'),
  search_strings: O('Chercher un texte', 'Trouve un texte et son adresse dans le binaire.', 'native'),
  search_bytes: O('Chercher des octets', 'Recherche une suite d\'octets.', 'native'),
  read_bytes: O('Lire des octets', 'Lit la mémoire à une adresse.', 'native'),
  list_segments: O('Lister les segments mémoire', 'Sections du programme (code, données...).', 'native'),
  list_names: O('Lister les noms', 'Symboles et etiquettes connus.', 'native'),
  xrefs: O('References croisees', 'Où une adresse est utilisee.', 'native'),
  find_xrefs_to_name: O('References vers un nom', 'Où un symbole est utilise.', 'native'),
  get_call_graph: O("Graphe d'appels", 'Qui appelle qui autour d\'une fonction.', 'native'),
  trace_call_path: O("Chemin d'appel entre deux fonctions", 'Comment on passe d\'une fonction a une autre.', 'native'),
  build_call_path: O("Construire un chemin d'appel", 'Assemble un chemin d\'appel avec ses preuves.', 'native'),
  compare_functions: O('Comparer deux fonctions', 'Différences entre deux fonctions.', 'compare'),
  match_native_functions: O('Apparier des fonctions', 'Retrouve les memes fonctions entre deux binaires.', 'compare'),
  find_changed_behavior: O('Trouver ce qui a change', 'Ce qui diffère entre deux versions d\'un programme.', 'compare'),
  inspect_native_api: O('Appels système utilises', 'API natives observées dans le code.', 'native'),
  trace_native_values: O('Suivre une valeur', 'Suit une valeur à travers le code machine.', 'native'),
  // Divers
  guided_workflows: O('Méthodes guidees', 'Scenarios d\'enquête pas a pas proposes par REA.', 'session'),
  inspect_analysis_view: O("Lire une partie d'un résultat", 'Pagine un gros résultat déjà calcule (pseudo-code, routes, inventaire...).', 'session'),
  export_evidence_bundle: O('Exporter les preuves', 'Sauvegarde toutes les preuves de la session dans un fichier.', 'session'),
  import_evidence_bundle: O('Importer des preuves', 'Recharge un fichier de preuves.', 'session'),
  reset_investigation: O("Réinitialiser l'enquête", 'Efface les preuves gardees en mémoire.', 'session'),
  verify_reconstruction: O('Vérifier une reconstruction', 'Compare une version reconstruite aux preuves de l\'originale.', 'build'),
  evaluate_reconstruction_coverage: O('Couverture de la reconstruction', 'Ce qui est reproduit et ce qui manque.', 'build'),
  compare_application_versions: O('Comparer deux versions d\'une appli', 'Différences entre deux versions installees.', 'compare'),
  compare_artifacts: O('Comparer deux fichiers', 'Différences entre deux paquets ou executables.', 'compare'),
  capture_process_scenario: O('Enregistrer un processus', 'Lance un programme et enregistre son comportement (fichiers, réseau...).', 'runtime'),
  capture_native_ui_scenario: O("Enregistrer l'interface d'une appli", 'Enregistre les fenêtres et actions d\'une appli native.', 'runtime'),
  observe_native_ui: O("Observer l'interface d'une appli", 'Arbre des fenêtres et controles d\'une appli native.', 'runtime'),
  instrument_with_frida: O('Instrumenter avec Frida', 'Injecte un script pour observer une appli en direct.', 'runtime'),
};

const WORDS = {
  inspect: 'Inspecter', analyze: 'Analyser', list: 'Lister', trace: 'Suivre', compare: 'Comparer', capture: 'Capturer',
  observe: 'Observer', get: 'Obtenir', read: 'Lire', search: 'Chercher', set: 'Définir', start: 'Démarrer', stop: 'Arrêter',
  close: 'Fermer', open: 'Ouvrir', export: 'Exporter', import: 'Importer', extract: 'Extraire', decode: 'Décoder', verify: 'Vérifier',
  update: 'Mettre à jour', record: 'Enregistrer', resolve: 'Résoudre', project: 'Projeter', install: 'Installer', uninstall: 'Désinstaller',
  pull: 'Récupérer', push: 'Envoyer', check: 'Vérifier', measure: 'Mesurer', mark: 'Marquer', load: 'Charger', unload: 'Decharger',
  identify: 'Identifier', demangle: 'Démangler', annotate: 'Annoter', collect: 'Collecter', correlate: 'Corréler', evaluate: 'Évaluer',
  find: 'Trouver', match: 'Apparier', build: 'Construire', act: 'Agir', reset: 'Réinitialiser', resume: 'Reprendre', unset: 'Retirer',
  goto: 'Aller à', next: 'Suivant', prev: 'Précédent', current: 'Actuel', execute: 'Exécuter', reconcile: 'Croiser', recover: 'Récupérer',
  audit: 'Auditer', discover: 'Découvrir', instrument: 'Instrumenter', comment: 'Commentaire', inline: 'en ligne', xrefs: 'references',
  address: 'adresse', addresses: 'adresses', procedure: 'fonction', procedures: 'fonctions', function: 'fonction', functions: 'fonctions',
  string: 'texte', strings: 'textes', bytes: 'octets', name: 'nom', names: 'noms', session: 'session', status: 'état', file: 'fichier',
  directory: 'dossier', package: 'paquet', packages: 'paquets', device: 'appareil', devices: 'appareils', screen: 'écran', app: 'appli',
  application: 'appli', process: 'processus', processes: 'processus', firmware: 'firmware', image: 'image', bundle: 'bundle',
  evidence: 'preuves', unknown: 'inconnue', unknowns: 'inconnues', bookmark: 'marque-page', bookmarks: 'marque-pages', settings: 'réglages',
  setting: 'réglage', analysis: 'analyse', view: 'vue', call: 'appel', calls: 'appels', graph: 'graphe', path: 'chemin', native: 'native',
  classes: 'classes', class: 'classe', method: 'méthode', protocols: 'protocoles', resources: 'ressources', signature: 'signature',
  types: 'types', metadata: 'métadonnées', crash: 'plantage', capture_: 'capture', database: 'base de données', archive: 'archive',
  environment: 'environnement', computer: 'ordinateur', task: 'tâche', checkpoint: 'point de contrôle', consent: 'consentement',
  script: 'script', logcat: 'journal logcat', activity: 'activité', window: 'fenêtre', display: 'affichage', features: 'fonctionnalités',
  services: 'services', client: 'client', scenario: 'scénario', debug: 'débogage', command: 'commande', console: 'console',
  instruction: 'instruction', instructions: 'instructions', exports: 'exports', initializers: 'initialiseurs', data: 'données', type: 'type',
  load_: 'chargement', layout: 'disposition', entropy: 'entropie', regions: 'regions', units: 'unités', module: 'module', dependencies: 'dependances',
  notes: 'notes', unwind: 'déroulement', ranges: 'plages', kernel: 'noyau', config: 'config', segments: 'segments', architectures: 'architectures',
  documents: 'documents', document: 'document', context: 'contexte', navigation: 'navigation', unknowns_: 'inconnues', obligation: 'obligation',
  ledger: 'registre', reconstruction: 'reconstruction', coverage: 'couverture', changed: 'modifie', behavior: 'comportement', values: 'valeurs',
  targets: 'cibles', target: 'cible', boundaries: 'frontières', managed: '.NET', members: 'membres', interface: 'interface', interfaces: 'interfaces',
  recording: 'enregistrement', decoders: 'décodeurs', signal: 'signal', packet: 'paquet réseau', fields: 'champs', pcap: 'PCAP', model: 'modèle',
  artifact: 'artefact', artifacts: 'artefacts', versions: 'versions', with: 'avec', to: 'vers', from: 'depuis', and: 'et', all: 'tout', item: 'élément',
  units_: 'unités', containing: 'contenant', binary: 'binaire', overview: 'vue d\'ensemble', guidance: 'aide', section: 'section', drop: 'deposer',
};

function autoLabel(name) {
  const w = name.split('_');
  const out = w.map((x, i) => WORDS[x] || x);
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function autoCategory(n) {
  if (/adb|android|apk|jadx|jeb|apktool|harmony/.test(n)) return 'android';
  if (/objc|swift|macho|plist|dylib|interface_builder|asset_catalog|keyed_archive|apple|ips|signature$/.test(n)) return 'apple';
  if (/web|browser|webmcp/.test(n)) return 'web';
  if (/javascript|electron|wasm|v8/.test(n)) return 'js';
  if (/firmware|uefi|devicetree|kernel|elf|ntfs|nvram|signal|pcap|packet|gpu/.test(n)) return 'firmware';
  if (/^compare|^match|changed/.test(n)) return 'compare';
  if (/frida|gdb|rizin|cutter|capture|observe|debug|crash/.test(n)) return 'runtime';
  if (/build|reconstruction|environment/.test(n)) return 'build';
  if (/pe_|desktop|windows|shortcut|managed|nuget/.test(n)) return 'windows';
  if (/procedure|address|xref|byte|string|segment|name|function|call|native|decompile|instruction|binary|architecture|document|bookmark|comment|navigation/.test(n)) return 'native';
  if (/evidence|unknown|guidance|guided|session|investigation|analysis/.test(n)) return 'session';
  return 'formats';
}

export function enrich(tool) {
  const o = OVERRIDES[tool.name];
  return {
    name: tool.name,
    label: o?.label || autoLabel(tool.name),
    desc: o?.desc || null,
    original: tool.description || '',
    category: o?.cat || autoCategory(tool.name),
    featured: !!o,
    inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    destructive: !!tool.annotations?.destructiveHint,
  };
}
