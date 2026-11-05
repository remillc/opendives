# OpenDives — Architecture proposée

2026-11-05 · Christian Rémillard

## 1. Résumé

OpenDives se construit en **trois couches**. En haut, une interface Web en JavaScript dans Capacitor, pensée pour le téléphone et la tablette. Au milieu, un mince pont natif en Swift (iOS) et en Kotlin (Android). En bas, un **cœur C++ partagé** qui reprend le code métier de Subsurface, débarrassé de Qt, avec libdivecomputer et libgit2. Tous les calculs, le format Git et le téléchargement depuis les ordinateurs de plongée sont dans le cœur. L'interface ne fait qu'afficher et envoyer des commandes.

**Décisions prises (5 novembre 2026)**

| Sujet | Décision |
| --- | --- |
| Données | Connexion au cloud Subsurface existant, qui reste la seule source de données ; mode local sans compte aussi pris en charge |
| Technologie | Capacitor : interface Web en JavaScript documenté par JSDoc (pas TypeScript) dans une app native iOS et Android |
| Périmètre de la première version | Toutes les fonctions « essentielles » et « adaptées », toutes les nouveautés mobiles, et la version tablette |
| Photos | Restent sur l'appareil ; seule la référence est synchronisée |
| Services | GeoNames (lieux), divelogs.de (import et envoi, sans synchronisation), OpenStreetMap (cartes, aussi hors ligne) |
| Coexistence avec Subsurface-mobile | Gérée explicitement (fidélité du format, conflits, version, Bluetooth, doublons, commits signés) |
| Relation avec le projet Subsurface | Aucune démarche pour l'instant ; à revoir avant la publication |

Interface : Svelte 5 + Framework7 v9 (décidé). Le code venant de Subsurface reste à jour avec Subsurface (décidé). Cartes : paquets OpenStreetMap hébergés par OpenDives (décidé). Toutes les décisions d'architecture sont prises.

## 2. Vue d'ensemble

> *Schéma : architecture d'OpenDives · 4 couches, 4 services externes — visible dans [le document en ligne](https://claude.ai/artifact/Q3xMEsTfLkAqTnwT4m33Z9).*

L'interface ne parle qu'au plugin OpenDivesCore. Le plugin traduit chaque appel pour le cœur C++ et gère ce qui dépend du système : Bluetooth, USB, trousseau, widget. Le cœur parle seul au cloud Subsurface et aux services Web. Seules les tuiles de carte sont chargées directement par l'interface. Ce découpage garantit qu'une plongée donne les mêmes chiffres que dans Subsurface, puisque c'est le même code qui calcule.

## 3. Le cœur C++ partagé

Le cœur de Subsurface est déjà écrit en grande partie en C++ standard. Il peut donc être extrait de Qt sans réécriture : il suffit de remplacer quelques fonctions utilitaires et les accès au système. J'ai mesuré dans `core/` (commit `258beb4`) que 89 fichiers sur 200 utilisent Qt. Les fichiers essentiels, eux, n'en dépendent pas ou presque.

| Partie du cœur | Dépendance à Qt | Traitement |
| --- | --- | --- |
| Lecture Git, modèle, plongée, ordinateur, voyages, sites, déco, planificateur, pressions des bouteilles, statistiques, unités | Aucune | Repris tel quel |
| Écriture Git, XML (lecture et écriture), profil, liste et journal, gaz, notes du planificateur | Un en-tête utilitaire (`qthelper.h`) ou un verrou (`QMutex`) | Petit module de remplacement en C++ standard (traduction, dates, notifications) |
| Accès Git distant | Expressions régulières et proxy Qt | `std::regex` ; proxy fourni par la plateforme |
| Filtres et recherche plein texte | `QString` utilisé en profondeur | Version minimale de `QString` fournie par `compat/`, sans toucher au code de Subsurface (le plus gros morceau de `c``ompat/`) |
| Téléchargement (`libdivecomputer.cpp`) | Noms d'appareils en `QString` | Adaptation légère |
| Bluetooth, série, réseau, compte cloud, réglages, Android | Qt Bluetooth, Qt Network, QSettings, JNI Qt | **Non repris** : remplacés par des adaptateurs fournis par le pont natif |
| Annuler et rétablir (`commands/`) | `QUndoCommand` | Logique des commandes reprise, pile réécrite en C++ standard |

**Organisation proposée.** Le code de Subsurface est inclus tel quel comme sous-module Git, épinglé à un commit précis. Les remplacements vivent dans un dossier `compat/` d'OpenDives qui fournit les mêmes fonctions que `qthelper.h`. On réduit ainsi au minimum les modifications du code de Subsurface. Suivre ses évolutions, notamment le format Git, revient alors à mettre à jour le sous-module et relancer les tests.

**Suivre Subsurface (décision du 5 novembre 2026).** Le code de Subsurface n'est jamais modifié dans OpenDives. Tout ce qui diffère passe par `compat/` ou par la façade. S'il faut absolument toucher à un fichier de Subsurface, le changement est gardé sous forme de **correctif séparé** (dossier `patches/`), réappliqué automatiquement à chaque mise à jour. Ces correctifs sont écrits pour pouvoir être proposés plus tard à Subsurface. Chaque semaine, l'intégration continue compile OpenDives avec la dernière version de Subsurface et lance les tests (aller-retour Git et calculs). On sait ainsi tout de suite si une amélioration de Subsurface peut être reprise, et ce qu'elle casse. La mise à jour elle-même reste un geste volontaire : on avance le sous-module, on relit les changements de format, on publie.

**La façade.** Au-dessus du code Subsurface, une petite couche (`libopendives`) expose une API stable et simple au pont natif. Elle convertit les données en JSON, garde l'état du journal ouvert, exécute les commandes avec annuler/rétablir et signale les progressions. Le reste d'OpenDives ne voit jamais les structures internes de Subsurface.

## 4. Le pont natif : l'API entre l'interface et le cœur

L'interface appelle un seul plugin, **OpenDivesCore**, avec des commandes asynchrones (promesses JavaScript) et reçoit des **événements** pour les opérations longues. Les formes des données échangées sont décrites en JSDoc (`@typedef`) dans un seul fichier, `core-api.js`, qui sert de contrat entre les équipes Web et natives.

| Groupe | Commandes principales | Remarques |
| --- | --- | --- |
| Journal | `openLog`, `closeLog`, `getLogInfo` | Ouvre le dépôt local (cloud ou local seul) |
| Compte et synchro | `signIn`, `createAccount`, `verifyPin`, `resetPassword`, `deleteAccount`, `sync`, `attachCloud` | Identifiants gardés par le pont dans le trousseau, jamais transmis à l'interface |
| Lecture | `listDives(page, filtre, tri)`, `getDive(id)`, `getProfile(id, dc)`, `listTrips`, `listSites`, `searchSites(proche de)`, `getStats(requête)` | Pagination pour les gros carnets ; le profil arrive calculé (courbes, plafond, ppO2, événements), prêt à dessiner |
| Écriture | `applyEdit(type, cible, valeurs)`, `undo`, `redo`, `canUndo` | Chaque modification passe par une commande annulable, reprise de `commands/` |
| Opérations | `mergeDives`, `splitDive`, `shiftTime`, `renumber`, `mergeSites`, `groupTrip`… | Elles aussi annulables |
| Ordinateurs | `scanDevices`, `listKnownDevices`, `downloadDives(appareil, options)`, `cancelDownload` | Progression et plongées reçues envoyées en événements |
| Planification et gaz | `planDive(paramètres)`, `gasMod`, `bestMix` | Calcul dans le cœur, résultat structuré et texte du plan |
| Fichiers | `importFile(chemin, format)`, `exportDives(sélection, format)` | XML, UDDF, FIT, CSV… ; partage via la feuille de partage du système |
| Services | `reverseGeocode(gps)`, `divelogsUpload`, `divelogsImport` | GeoNames et divelogs.de appelés côté natif |
| Événements | `downloadProgress`, `syncProgress`, `logChanged`, `conflictResolved`, `error` | `logChanged` précise ce qui a changé pour ne rafraîchir que le nécessaire |

**Règles du pont.**

- Les valeurs restent en unités SI entières, comme dans le cœur (mm, mbar, mK, s). La conversion en m/pi, bar/psi, °C/°F se fait dans l'interface, au moment de l'affichage.
- Le cœur tourne sur un fil d'exécution dédié ; aucun appel ne bloque l'interface.
- Les données volumineuses (profil, liste) sont envoyées en tableaux compacts plutôt qu'en objets, pour limiter la taille du JSON.
- Une erreur porte un code stable (`AUTH_FAILED`, `FORMAT_NEWER`, `DEVICE_BUSY`…) que l'interface traduit.

## 5. Ordinateurs de plongée

libdivecomputer connaît le protocole de chaque ordinateur, mais pas le transport. Il délègue la lecture et l'écriture des octets à des fonctions qu'on lui fournit (`dc_custom_open`), et Subsurface s'en sert déjà pour le BLE et l'USB Android. OpenDives fait pareil : le **transport est écrit en natif** dans le pont, et le **protocole reste dans le cœur**. Les octets ne passent jamais par l'interface Web.

| Transport | iOS | Android | Mise en œuvre |
| --- | --- | --- | --- |
| Bluetooth LE | Oui | Oui | Core Bluetooth (Swift), BluetoothGatt (Kotlin) ; choix du service et des caractéristiques repris de `qt-ble.cpp` (Telit, u-blox, services série connus) |
| Bluetooth classique | Non (limite d'iOS) | Oui | Socket RFCOMM (Kotlin) |
| USB série | Non | Oui | Bibliothèque usb-serial-for-android (FTDI, CP210x, CDC…), déjà utilisée par Subsurface |
| Fichiers (FIT, journaux) | Oui | Oui | Import de fichiers, sans transport |

**Déroulement d'un téléchargement**

1. Le pont cherche les appareils proches. Le cœur reconnaît le fabricant et le modèle d'après le nom Bluetooth (tables de `btdiscovery.cpp`).
2. L'utilisateur confirme une fois ; l'appareil est mémorisé avec son surnom.
3. Le cœur lance libdivecomputer sur un fil dédié. Les lectures sont bloquantes, avec délai : le pont les sert depuis une file d'octets alimentée par le Bluetooth.
4. L'**empreinte** de la dernière plongée téléchargée (enregistrée dans le dépôt Git) arrête le téléchargement aux plongées déjà connues, même si elles ont été téléchargées par Subsurface sur un autre appareil.
5. Les plongées reçues sont fusionnées par les règles d'import de Subsurface (doublons, voyages), puis sauvegardées en un seul commit annulable.
6. Le pont **libère la connexion** à la fin ou en cas d'erreur, pour que Subsurface-mobile ou une autre app puisse s'y connecter (décision de coexistence).

**Contraintes de plateforme.** L'écran reste allumé pendant le téléchargement : iOS et Android coupent le Bluetooth des apps en arrière-plan. Les permissions Bluetooth sont demandées au premier usage, pas au lancement. Le simulateur iOS n'a pas de Bluetooth : les tests se font sur un vrai appareil, ou avec un transport simulé qui rejoue des captures d'octets.

## 6. Stockage, synchronisation, mode local et coexistence

Tout le carnet vit dans **un dépôt Git local**, dans l'espace privé de l'app, au format exact de Subsurface. Le cloud n'est qu'un dépôt distant de plus. Le mode local et le mode cloud partagent donc le même code : la seule différence est la présence d'un dépôt distant.

| Situation | Comportement |
| --- | --- |
| Mode local (sans compte) | Dépôt Git sans distant ; import et export manuels possibles |
| Passage au cloud | Si le compte est vide : envoi du dépôt local tel quel. S'il contient déjà des plongées : les plongées locales y sont **importées** avec les règles de doublons, jamais écrasées (`classify_git_save`) |
| Enregistrement | Chaque commande validée donne un commit local, signé « OpenDives », avec le texte de l'action comme message |
| Synchronisation | À l'ouverture, au retour au premier plan, quelques secondes après une modification, et à la demande. Hors ligne, les commits attendent le réseau |
| Conflit | Fusion de libgit2 comme dans Subsurface ; si un côté l'a emporté, l'utilisateur en est averti et la plongée est signalée |
| Format plus récent | Si la version du format dans `00-Subsurface` dépasse celle que connaît OpenDives, le carnet s'ouvre **en lecture seule**, avec un message invitant à mettre à jour l'app |
| Identifiants | Mot de passe cloud dans le trousseau iOS ou le Keystore Android, lu par le pont seulement |

**Fidélité du format.** Comme la lecture et l'écriture Git sont le code même de Subsurface, tout ce que Subsurface écrit est relu et réécrit à l'identique. C'est vrai pour la version de Subsurface incluse dans OpenDives ; la garde de version couvre les formats plus récents. Un test automatique le vérifie : chargement puis sauvegarde de dépôts réels, sans aucune différence.

**Photos et vidéos.** Le dépôt ne garde que la référence de chaque média (nom du fichier et décalage dans la plongée), comme Subsurface. OpenDives tient en plus, localement et hors du dépôt, une table qui relie chaque référence à la photo de la galerie de l'appareil. Sur un autre appareil, la plongée indique qu'un média existe sans pouvoir l'afficher.

**Réglages.** Les réglages qui changent les calculs (GF, ppO2 max, SAC par défaut) et les unités suivent Subsurface : enregistrés dans le dépôt quand Subsurface le fait, sinon sur l'appareil. Les réglages d'affichage d'OpenDives restent sur l'appareil.

## 7. L'interface

L'interface est une app Web monopage en **JavaScript moderne (modules ES) documenté par JSDoc**, empaquetée par Vite et embarquée par Capacitor. Elle ne contient aucune règle métier : elle affiche ce que renvoie le cœur et lui envoie des commandes. Sa conception visuelle sera faite à l'étape 5, sur une page blanche.

| Besoin | Proposition | Pourquoi |
| --- | --- | --- |
| Composants mobiles | Framework7 v9 (décidé) | Rendu natif iOS 26 et Material You (MD3), navigation par pile avec retour par balayage, liste + détail pour la tablette ; prise en charge officielle de Svelte 5 |
| Cadre applicatif | Svelte 5 (décidé) | Code concis et compilé, léger, qui s'écrit bien en JavaScript avec JSDoc. Préféré à Vue 3 + Ionic, qui n'offre pas de rendu MD3 ni iOS 26 sans thèmes tiers |
| Vérification des types | JSDoc + `// @ts-check`, vérifié dans l'éditeur et dans l'intégration continue | On garde du JavaScript pur, avec les erreurs de types détectées avant l'exécution |
| Profil de plongée | Dessin sur `canvas` 2D, écrit pour OpenDives | Des milliers de points, plusieurs courbes, zoom au doigt : un graphique générique ne suffit pas |
| Statistiques | Chart.js (licence MIT) | Barres et nuages de points prêts à l'emploi ; licence compatible avec la GPLv2 (voir section 8) |
| Cartes | MapLibre GL JS avec tuiles vectorielles OpenStreetMap | Rapide, hors ligne possible, sans compte Google |
| Langues | Fichiers de traduction JSON (français et anglais au départ) | Format simple pour les traducteurs |
| Unités | Module de conversion unique, à partir des valeurs SI du cœur | Mêmes règles d'arrondi partout |

**Cartes hors ligne : une contrainte à connaître.** La [politique d'utilisation des tuile](https://operations.osmfoundation.org/policies/tiles/)[s de la fondation OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) interdit l'usage hors ligne sur ses serveurs, y compris les fonctions du type « télécharger une ville pour plus tard ». Elle recommande des tuiles hébergées soi-même ou un fournisseur qui autorise explicitement le hors ligne. Décision C : OpenDives héberge ses propres paquets de tuiles vectorielles par région (format PMTiles), construits à partir des données OpenStreetMap. L'app les utilise en ligne et les télécharge pour le hors ligne, sans jamais solliciter les serveurs de la fondation OpenStreetMap.

**Tablette.** Les mêmes écrans s'adaptent à la largeur : liste et détail côte à côte sur tablette, l'un après l'autre sur téléphone. Les fonctions marquées « version plus complète » sur tablette (statistiques, planificateur, édition groupée) gagnent des panneaux supplémentaires, pas des écrans différents.

**Nouveautés mobiles**

| Fonction | Réalisation |
| --- | --- |
| Position GPS du site | Plugin Capacitor de géolocalisation, puis GeoNames pour le pays et la région |
| Photos de la galerie | Plugin de sélection de médias ; l'heure de prise de vue place la photo sur le profil |
| Partage en image | Le profil est rendu en PNG par l'interface, puis la feuille de partage du système prend le relais |
| Widget d'écran d'accueil | Code natif séparé (WidgetKit sur iOS, Glance sur Android), alimenté par un petit résumé écrit par le cœur |
| Carte hors ligne | Paquets PMTiles par région hébergés par OpenDives, téléchargés à la demande (par exemple la région d'un voyage) |
| Rappels | Notifications locales calculées par le cœur (fin de désaturation, délai avant un vol), sans serveur |

## 8. Dépôt, build, tests et licence

**Organisation du dépôt ****`remillc/opendives`**

| Dossier | Contenu |
| --- | --- |
| `app/` | Interface Web : sources JavaScript, traductions, configuration Vite |
| `plugins/opendives-core/` | Plugin Capacitor : `ios/` (Swift), `android/` (Kotlin), `core-api.js` (contrat JSDoc) |
| `core/` | Façade C++ `libopendives`, module `compat/` qui remplace Qt, tests du cœur |
| `third_party/` | Sous-modules épinglés : Subsurface, libdivecomputer (branche de Subsurface), libgit2, libxml2, libxslt, SQLite, libzip |
| `ios/`, `android/` | Projets natifs générés par Capacitor, avec les widgets (WidgetKit, Glance) |
| `docs/` | Analyse, rétro-ingénierie, architecture, décisions |

**Build.** Le cœur se compile avec CMake : en bibliothèques `.so` par architecture pour Android (NDK, arm64 et x86_64), en XCFramework pour iOS (appareil et simulateur). **Attention : la compilation iOS exige un Mac.** Depuis votre poste Windows, Android se compile en local, et iOS passe par un Mac ou par l'intégration continue (GitHub Actions, machines macOS). L'intégration continue compile le cœur et lance ses tests sous Linux, construit les deux apps et vérifie le JavaScript (lint et `@ts-check`).

**Tests, par ordre d'importance**

1. **Aller-retour Git** : charger puis réécrire des dépôts réels de Subsurface, et vérifier qu'il n'y a **aucune différence**. C'est la garantie de compatibilité avec le cloud.
2. **Calculs** : comparer SAC, déco, CNS et plans aux résultats de Subsurface sur les fichiers d'exemple de son dépôt (159 fichiers dans `dives/`), en reprenant ses tests (`tests/`, 17 600 lignes).
3. **Coexistence** : scénarios automatisés avec Subsurface de bureau sur un compte de test (modifications des deux côtés, conflits, format plus récent).
4. **Téléchargement** : transport simulé qui rejoue des captures Bluetooth, puis essais sur de vrais ordinateurs de plongée.
5. **Interface** : tests unitaires (Vitest) et parcours de bout en bout sur émulateurs.

**Licence.** En reprenant le code de Subsurface, publié sous **GPLv2 seulement** (« GPL-2.0 », sans « ou version ultérieure »), OpenDives doit lui-même être publié sous GPLv2. Les autres briques sont compatibles : libdivecomputer (LGPL-2.1 ou ultérieure), libgit2 (GPLv2 avec exception de liaison), Capacitor, Framework7 et Svelte (MIT), MapLibre (BSD), Chart.js (MIT). Il faut éviter les bibliothèques sous Apache-2.0, souvent jugée incompatible avec la GPLv2 seule. Deux points délicats sont à faire vérifier par un juriste avant la publication : la distribution sur l'App Store (Subsurface-mobile y est pourtant publié) et la liaison statique de libdivecomputer sur iOS. Je ne suis pas juriste.

## 9. Décisions à prendre et risques

**D****écisions avant de coder**

- [x] **A. Cadre applicatif de l'interface** : décidé le 5 novembre 2026 : Svelte 5 + Framework7 v9. Risque accepté : Framework7 repose surtout sur un mainteneur ; l'interface reste mince pour pouvoir être remplacée. À valider par un essai d'une journée sur un vrai téléphone Android et un iPhone.
- [x] **B. Reprise du code Subsurface** : décidé le 5 novembre 2026 : le code venant de Subsurface doit pouvoir être mis à jour quand Subsurface s'améliore. Donc sous-module épinglé + module `compat/`, sans copie modifiée du code.
- [x] **C. Tuiles pour la carte hors ligne** : décidé le 5 novembre 2026 : paquets PMTiles par région, construits à partir des données OpenStreetMap et hébergés par OpenDives, utilisés en ligne comme hors ligne. À prévoir : un hébergement de fichiers statiques, la régénération périodique des paquets et la mention « © contributeurs OpenStreetMap ».

**Risques**

| Risque | Conséquence | Parade |
| --- | --- | --- |
| Perte de données lors d'une écriture Git | Carnets corrompus pour les utilisateurs de Subsurface | Code Git de Subsurface réutilisé tel quel, test d'aller-retour obligatoire avant chaque version, garde de version de format |
| Évolution du format par Subsurface | OpenDives bloqué en lecture seule | Suivre les versions de Subsurface, mettre à jour le sous-module, tests automatiques |
| Serveurs Subsurface | Le projet pourrait limiter un client inconnu ; aucune démarche n'est prévue pour l'instant | Client bien identifié (User-Agent, commits signés), synchronisation sobre ; décision à revoir avant publication |
| Particularités Bluetooth de chaque fabricant | Téléchargements qui échouent sur certains modèles | Reprendre les réglages BLE de Subsurface, transport simulé, bêtas avec des plongeurs équipés de modèles variés |
| Licence GPLv2 et App Store | Publication iOS contestée | Avis juridique avant publication ; Subsurface-mobile sert de précédent |
| Volume de données dans le pont | Lenteurs sur les gros carnets | Pagination, tableaux compacts, profils calculés dans le cœur |
| Compilation iOS | Impossible depuis Windows | Mac d'appoint ou intégration continue macOS |

**Suite proposée.** A, B et C étant tranchées, l'étape 5 (conception de l'interface) peut démarrer en parallèle d'une première **preuve de concept technique** : compiler le cœur sans Qt pour Android, ouvrir un vrai carnet cloud, l'afficher dans une liste, et réussir l'aller-retour Git sans différence.
