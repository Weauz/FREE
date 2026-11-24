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

Il vous faut un abonnement Claude (Pro, Max, Team ou Enterprise) pour Claude Code. Le guide complet est dans [LISEZ-MOI.txt](LISEZ-MOI.txt). **Lisez le [cadre légal](#️-cadre-légal-et-risques) avant d'analyser quoi que ce soit.**

## Contenu du dépôt

| Dossier | Rôle |
|---|---|
| `app/` | Le serveur local (Node.js) et l'interface |
| `launcher/` | `FREE.exe` : lance FREE, vérifie les prérequis, ouvre la fenêtre (C#, .NET Framework 4) |
| `setup/` | `FREE-Installation.exe` : installateur, désinstallateur et mise à jour automatique |
| `installation/` | Script PowerShell d'installation des prérequis |

## ⚖️ Cadre légal et risques

FREE est un outil d'étude. **Vous êtes seul responsable de l'usage que vous en faites.** Ce qui suit est un résumé simplifié du droit français et européen, pas un conseil juridique. En cas de doute (usage commercial, logiciel d'une entreprise, publication), demandez l'avis d'un avocat.

### Ce qui est généralement permis

- **Observer et étudier le fonctionnement d'un logiciel que vous avez le droit d'utiliser**, en l'utilisant normalement, pour comprendre les idées et principes sur lesquels il repose (Code de la propriété intellectuelle, art. L122-6-1).
- **Décompiler un logiciel pour le rendre compatible avec un autre programme** (« interopérabilité »), sous conditions strictes :
  - vous êtes un utilisateur légitime ;
  - l'information n'est pas déjà disponible ailleurs ;
  - vous vous limitez aux parties nécessaires.

  Les informations obtenues ne peuvent pas servir à autre chose qu'à cette interopérabilité.
- **Analyser vos propres logiciels et sites**, ou ceux pour lesquels vous avez une autorisation écrite (audit, test de sécurité).
- **Analyser un fichier suspect** (virus, logiciel malveillant) pour vous en protéger.

### Ce qui est interdit ou risqué

- **Copier le code, les images, les textes, les sons ou la marque** d'un logiciel ou d'un site, même « reconstruits » ou traduits. C'est de la contrefaçon.
- **Contourner une protection technique** : DRM, licence, anti-triche, chiffrement, vérification de compte. Porter atteinte sciemment à une mesure technique efficace, à des fins autres que la recherche, est puni d'amende (art. L335-3-1).
- **Accéder à un système ou à des données sans autorisation**, par exemple des serveurs, des API privées ou des comptes d'autres personnes. C'est un délit pénal (Code pénal, art. 323-1 et suivants).
- **Ignorer les conditions d'utilisation (CGU / licence)** : beaucoup interdisent la rétro-ingénierie. Une clause ne peut pas supprimer les droits prévus par la loi, mais la violer peut entraîner la fermeture du compte ou des poursuites.
- **Collecter des données personnelles** lors de l'analyse d'un site ou d'une appli. Le RGPD s'applique.
- **Vendre ou diffuser une reconstruction** qui imite l'original au point de créer la confusion (nom, logo, apparence). C'est un risque de contrefaçon de marque et de concurrence déloyale.

### Les reconstructions faites avec FREE

FREE et Claude Code sont conçus pour produire des **versions originales** : même type de logiciel et mêmes idées générales, mais avec un code, des textes, des images et un nom différents. Avant de partager ou de vendre une reconstruction, vérifiez vous-même qu'elle ne reprend rien de protégé de l'original.

### Garantie et responsabilité

FREE est fourni « tel quel », sans garantie. NetLance n'est pas responsable de l'usage qui en est fait, ni des dommages éventuels (perte de données, blocage de compte, poursuites). L'utilisation de Claude Code est aussi soumise aux [conditions d'utilisation d'Anthropic](https://www.anthropic.com/legal/aup).

© 2026 NetLance
