# FREE — French Reverse Engineer Everything

Application Windows en français, par **NetLance**, pour comprendre comment fonctionne une appli ou un site web, puis en créer votre propre version.

1. **Analyse** d'une appli Windows (.exe), d'une appli Electron ou d'un site web, avec [REA (Reverse Engineer Anything)](https://www.npmjs.com/package/rea-agents) et Ghidra.
2. **Enquêtes** : Claude Code explique comment marche une fonctionnalité précise.
3. **Plan de reconstruction**, puis **reconstruction** d'une version originale par Claude Code.
4. **Évolutions** : demandez des changements (thème, nouvelles fonctions…).

Tout tourne sur votre PC.

## Installer

Téléchargez **`FREE-Installation.exe`** dans la [dernière version](https://github.com/Weauz/FREE/releases/latest), puis double-cliquez dessus.

- Aucun droit administrateur n'est nécessaire.
- Au premier lancement, FREE installe ce qui lui manque : Node.js, Java, Ghidra, REA et Claude Code.
- Le fichier n'est pas signé numériquement : si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires** puis **Exécuter quand même**.
- FREE se met ensuite à jour tout seul : un bandeau « Mettre à jour » apparaît quand une nouvelle version est publiée ici.

Il vous faut un abonnement Claude (Pro, Max, Team ou Enterprise) pour Claude Code. Le guide complet est dans [LISEZ-MOI.txt](LISEZ-MOI.txt).

## Contenu du dépôt

| Dossier | Rôle |
|---|---|
| `app/` | Le serveur local (Node.js) et l'interface |
| `launcher/` | `FREE.exe` : lance FREE, vérifie les prérequis, ouvre la fenêtre (C#, .NET Framework 4) |
| `setup/` | `FREE-Installation.exe` : installateur, désinstallateur et mise à jour automatique |
| `installation/` | Script PowerShell d'installation des prérequis |
| `build.sh` | Fabrique une version : `./build.sh 1.1.0` (mono `mcs`, `windres`) |

## Publier une mise à jour

1. Augmenter le numéro avec `./build.sh X.Y.Z`.
2. Créer une *release* GitHub avec le tag `vX.Y.Z` et joindre `FREE-Installation.exe`.
3. Les FREE installés détectent la nouvelle version au démarrage (ou dans les 6 heures).

## Utilisation responsable

Analysez uniquement des logiciels et des sites que vous avez le droit d'analyser. Les reconstructions doivent être des versions originales : ni le code, ni les textes, ni les images, ni la marque des logiciels analysés.

© 2026 NetLance
