# OpenDives — Analyse du projet Subsurface

2026-11-05 · Christian Rémillard

## 1. Résumé

Subsurface est un carnet de plongée libre (GPLv2) et mûr. Tout le code est dans un seul dépôt C++/Qt : un cœur métier commun d'environ 62 000 lignes et deux interfaces, une pour le bureau et une pour le mobile. Pour OpenDives, la décision qui structure tout le reste est la suivante : réutiliser ce cœur et libdivecomputer, ou réécrire la logique métier.

- **Forces à conserver** : 366 ordinateurs de plongée en import direct, des calculs de décompression reconnus (Bühlmann ZH-L16 et VPM-B), un format de données ouvert, un cloud gratuit basé sur Git, et un fonctionnement hors ligne.
- **Faiblesses à corriger** : l'app mobile n'est qu'un compagnon du bureau. Son interface est dense et issue du bureau, sa logique est concentrée dans un contrôleur monolithique (`QMLManager`, 2 715 lignes), il n'y a pas de suivi GPS en plongée, et les versions iOS et Android ne font pas la même chose.
- **Étape suivante** : c'est à vous de choisir les frameworks. La section 6 liste les critères et compare cinq options.

**Sources analysées**

- Le dépôt [github.com/subsurface/subsurface](https://github.com/subsurface/subsurface), branche `master`, commit `258beb4` du 4 novembre 2026 : 1 869 fichiers, avec le CMake, le packaging Android et iOS, le manuel mobile v3, les notes de version et `SupportedDivecomputers.txt`.
- Le sous-module [Subsurface/libdc](https://github.com/Subsurface/libdc), branche `Subsurface-NG` : seulement sa déclaration, son contenu n'a pas été cloné.
- Le site [subsurface-divelog.org](https://subsurface-divelog.org/), lu le 5 novembre 2026 : accueil, Version actuelle, Notes de version, FAQ, Documentation, Participer, Politique de confidentialité.
- Les fiches App Store et Play Store de Subsurface-mobile.

## 2. Vue d'ensemble et architecture du code

Subsurface a été créé en 2011 par Linus Torvalds et est maintenu depuis 2012 par Dirk Hohndel. Depuis fin 2023, il n'y a plus de versions formelles mais des builds automatisés fréquents. La version « occasionnelle » actuelle est la 6.0.5738 du 4 octobre 2026. Le projet est entièrement bénévole et sous licence GPLv2. Le site annonce environ 20 langues ; le dépôt contient 34 fichiers de traduction, gérés via Transifex.

**Stack technique** : C++ (std::vector, std::string), Qt 6.10 pour le mobile (Qt 5 reste pris en charge sur le bureau), le build CMake, et les bibliothèques libgit2, libxml2/libxslt, SQLite (imports), libzip, libusb, libftdi (optionnelle), LibRaw, Qt Bluetooth, Qt Location et KDE Kirigami pour le mobile. La CI tourne sur GitHub Actions, avec 14 workflows de build : Android, iOS, Windows MSVC et MXE, macOS, Ubuntu, Fedora, Snap, AppImage.

| Module | Rôle | Volume (lignes) |
| --- | --- | --- |
| `core/` | Modèle de données, calculs (déco, gaz, SAC, CNS/OTU), planificateur, imports/exports, Git/cloud, Bluetooth/USB, libdivecomputer | 61 600 |
| `desktop-widgets/` | Interface du bureau (Qt Widgets) | 24 100 |
| `tests/` | Tests unitaires Qt Test | 17 600 |
| `mobile-widgets/` | Interface mobile : 37 écrans QML Kirigami + `QMLManager` (C++) | 14 100 |
| `qt-models/` | Modèles Qt (liste de plongées, bouteilles, etc.) partagés par les deux interfaces | 10 300 |
| `stats/` | Graphiques statistiques (Qt Quick scene graph) | 9 500 |
| `profile-widget/` | Rendu du profil de plongée (scène Qt, `QMLProfile` pour le mobile) | 6 200 |
| `commands/` | Annuler/rétablir (pattern Command) | 6 000 |
| `map-widget/` | Carte des sites (Qt Location, QML) | 1 400 |
| `smtk-import/`, `cli/`, `backend-shared/` | Import SmartTrak, ligne de commande, utilitaires d'export | 3 200 |
| `libdivecomputer/` | Sous-module : fork de libdivecomputer (LGPL-2.1) | externe |
| `android-mobile/`, `ios/` | Activité Java, manifeste, Gradle (minSdk 28, targetSdk 36) ; plist iOS | 900 |

Le découpage en couches est clair : `core` (C++ pur, peu dépendant de l'interface) → `qt-models` et `commands` → deux interfaces. C'est cette séparation qui permet d'envisager de réutiliser `core` sans les interfaces Qt. Mais `core` dépend encore de Qt à plusieurs endroits : `qthelper.cpp`, `qt-ble.cpp`, `cloudstorage.cpp` (QNetwork) et les réglages (`core/settings`).

## 3. Cœur métier, formats, cloud et ordinateurs de plongée

**Modèle de données.** Le journal (`divelog`) contient des plongées, des voyages (`dive_trip`), des sites (`dive_site`, avec coordonnées GPS et taxonomie pays/région), des réglages et des filtres prédéfinis. Une plongée (`struct dive`) porte la date, le site, les notes, le guide, les compagnons, la combinaison, les bouteilles, les lests, les tags, les photos, des notes de 0 à 5 (conditions, visibilité, houle…), le SAC, le CNS et l'OTU, ainsi que **plusieurs ordinateurs** (`divecomputer`). Chaque ordinateur a ses propres échantillons (`sample` : profondeur, température, jusqu'à 10 capteurs de pression, ppO2 et 6 cellules pour les recycleurs, NDL, TTS, déco, cap, rythme cardiaque), ainsi que ses événements et ses données supplémentaires. Les unités internes sont des entiers SI fins (mm, mK, mbar, secondes), ce qui évite les erreurs d'arrondi.

**Calculs.** Décompression Bühlmann ZH-L16 avec facteurs de gradient et VPM-B (`deco.cpp`), planificateur multi-gaz air, Nitrox et Trimix, avec gaz de secours et circuit fermé (`planner.cpp`), pressions partielles et MOD/MND, SAC, statistiques et filtres plein texte.

**Formats.**

- Natif : XML (`.ssrf`, `<divelog program='subsurface' version='3'>`), lisible et versionnable.
- Cloud : un **dépôt Git** organisé en arborescence `année/mois/…` avec un fichier par plongée, plus `00-Subsurface` (réglages) et `01-Divesites/Site-<uuid>`.
- Imports : CSV, Suunto (DM3/DM4/DM5, JSON), Shearwater, DivingLog, Seac, LogTrak, Cobalt, ASD, Datatrak, Liquivision, Cochran, Uemis, OSTC Tools, Garmin FIT, SmartTrak, GPX, ainsi que MacDive et JDiveLog selon le site.
- Exports : XML, Git, CSV, profils, HTML et carte du monde, LaTeX, et envoi vers divelogs.de et DiveShare.

**Cloud Subsurface.** Il fonctionne par Git sur HTTPS, avec quatre serveurs miroirs (`ssrf-cloud-us/u2/eu/e2.subsurface-divelog.org`, alias `cloud.subsurface-divelog.org`). Le compte se crée par e-mail et mot de passe, puis se valide par un **PIN envoyé par courriel** (point d'API `/verify`). Il est possible de supprimer le compte ou de réinitialiser le mot de passe. Les données sont mises en cache local (fonctionnement hors ligne) et synchronisées à la demande ou automatiquement. La protection contre l'écrasement de données (`classify_git_save`) a été ajoutée récemment. Un mode « sans cloud », purement local, existe aussi. Le service est gratuit, sans monétisation, et financé par des dons (Ko-fi, GitHub Sponsors).

**Ordinateurs de plongée.** La communication passe par un fork de libdivecomputer (branche `Subsurface-NG`, LGPL-2.1). La liste générée compte **3****66 modèles chez 40**** fabricants** en import direct, plus 11 formats d'import par fichier (Garmin FIT, Shearwater Desktop, Suunto DM, etc.). Les transports pris en charge sont :

- l'USB série (libusb, FTDI, pilote Android `serial_usb_android.cpp`) ;
- le Bluetooth classique (`qtserialbluetooth.cpp`) ;
- le **Bluetooth LE** (`qt-ble.cpp`), branché sur libdivecomputer par ses entrées/sorties personnalisées.

La découverte (`btdiscovery.cpp`) reconnaît le fabricant et le modèle à partir du nom Bluetooth. Il est aussi possible de configurer certains ordinateurs (OSTC 3 et 4, Suunto Vyper). Sur iOS, seul le BLE est possible.

## 4. L'app mobile actuelle et le site Web

Subsurface-mobile est décrit par le projet lui-même comme une **version limitée, compagnon du bureau**, qui sert à consulter le carnet, faire de petites modifications et télécharger depuis l'ordinateur de plongée. Elle reprend le même `core` C++, les mêmes `qt-models`, le même profil et les mêmes statistiques que le bureau, avec une interface QML et Kirigami (KDE) par-dessus.

| Écran ou fonction (menu latéral) | Fichier QML principal | Remarque |
| --- | --- | --- |
| Liste des plongées, filtre plein texte, voyages | `DiveList.qml`, `TripDetails.qml` | Liste groupée par voyage |
| Détail d'une plongée avec profil, balayage entre plongées | `DiveDetails*.qml` (environ 2 300 lignes) | Formulaire d'édition très long (1 084 lignes) |
| Ajout manuel d'une plongée | `DiveDetailsEdit.qml` |  |
| Téléchargement depuis l'ordinateur (USB, BT, BLE) | `DownloadFromDiveComputer.qml` | Choix fabricant, modèle et connexion ; 4 ordinateurs mémorisés |
| Synchronisation cloud manuelle ou automatique, identifiants | `CloudCredentials.qml` | PIN par courriel |
| Résumé et statistiques (barres, nuages de points, comparaisons) | `DiveSummary.qml`, `StatisticsPage.qml` |  |
| Export (fichier, courriel, divelogs.de, DiveShare) et import de fichier | `Export*.qml` |  |
| Carte des sites | `MapPage.qml` | Qt Location ; l'ancien suivi GPS a disparu |
| Planificateur de plongée et calculateur de gaz | `DivePlanner*.qml` | Environ 1 700 lignes de QML |
| Réglages : thème, police, unités, bouteille par défaut, Bluetooth | `Settings.qml` | 879 lignes |
| Aide, manuel, support par courriel avec journaux, menu développeur | `About.qml`, `Log.qml` |  |

**Constats techniques.**

- Toute la logique de l'interface passe par `QMLManager` (2 715 lignes, environ 60 propriétés et méthodes exposées au QML). C'est un « objet dieu » difficile à tester.
- La navigation se fait par un tiroir latéral et une pile de pages Kirigami, avec un aspect assez éloigné de Material 3 et des conventions iOS.
- Plateformes : Android 9 et plus (minSdk 28, targetSdk 36) et iOS 17 et plus. Sur iOS, seul le BLE est possible et les versions sont rares, car l'App Store est le seul canal de distribution.
- Distribution Android : Play Store et APK installé manuellement (avec Obtainium). Le passage de l'un à l'autre exige de désinstaller l'app et de resynchroniser depuis le cloud.
- Le build est lourd : Qt 6 compilé pour Android et iOS, Kirigami et ECM, libgit2, libssh2, libdivecomputer, dans une image Docker dédiée.
- Elle n'a ni widgets d'écran d'accueil, ni Apple Watch ou Wear OS, ni partage social, ni affichage ou ajout de photos (pourtant présents dans le modèle de données), ni carte hors ligne, ni mode écran mouillé ou lisibilité au soleil dédiée.

**Site Web (****[subsurface-divelog.org](https://subsurface-divelog.org/)****, lu le 5 novembre 2026).** Il présente le bureau (Windows, macOS, Linux) comme le produit principal, et le mobile comme un complément. Il contient :

- les pages Version actuelle (6.0.5738 du 4 octobre 2026, avec des builds Windows Qt 5 et Qt 6, macOS ARM et Intel, Android APK et iOS App Store) et Dernière version de développement ;
- la documentation (manuels bureau et mobile, liste des ordinateurs, FAQ, suppression de compte) ;
- le forum, le suivi des bugs, la page Participer et les dons.

La politique de confidentialité tient en une phrase : le service ne garde que l'e-mail du compte, avec des serveurs aux États-Unis et en Allemagne, et aucune utilisation des données. La FAQ insiste sur le caractère bénévole du projet, l'indépendance vis-à-vis des fabricants et le planificateur VPM-B/Bühlmann. Le site ne propose **aucun carnet consultable en ligne** ni d'API publique documentée pour le cloud : l'accès se fait uniquement par Git.

## 5. Forces, faiblesses et opportunités pour OpenDives

|  | Constat | Conséquence pour OpenDives |
| --- | --- | --- |
| Force | 366 ordinateurs pris en charge grâce à libdivecomputer, avec la détection Bluetooth | À réutiliser absolument : le réécrire coûterait des années |
| Force | Calculs de décompression et planificateur éprouvés, couverts par des tests | À réutiliser, ou à porter avec ses tests comme référence |
| Force | Formats ouverts (XML, Git) et cloud gratuit | La compatibilité avec le cloud et les fichiers Subsurface est un argument d'adoption fort |
| Force | Fonctionnement hors ligne en premier, avec un cache local | À conserver comme principe |
| Faiblesse | Interface mobile dense, issue du bureau, navigation par tiroir | Le principal levier d'amélioration : une interface mobile native moderne |
| Faiblesse | `QMLManager` monolithique, logique d'interface mélangée au métier | Séparer nettement les couches (domaine, données, interface) |
| Faiblesse | Build Qt mobile lourd et peu de contributeurs mobiles | Choisir une stack mobile avec un vivier de développeurs plus large |
| Faiblesse | iOS en retrait (BLE seulement, versions rares) | Parité iOS/Android dès la conception |
| Opportunité | Photos, carte hors ligne, widgets, montre, partage, mode écran mouillé absents | Différenciateurs possibles d'OpenDives |
| Contrainte | Code GPLv2 ; libdivecomputer en LGPL-2.1 | Réutiliser `core` impose la GPLv2 pour OpenDives ; libdivecomputer seule est plus souple (voir section 6) |

## 6. Critères et options pour le choix des frameworks

Le choix dépend d'abord de vos réponses aux cinq questions ci-dessous. Le tableau compare ensuite sept options, sans trancher : la décision vous revient (étape 2).

**Questions à trancher avant de choisir**

1. **Réutilisation** : garder le `core` C++ de Subsurface tel quel, garder seulement libdivecomputer et réécrire le métier, ou tout réécrire ?
2. **Compatibilité ****—** **décidé le 5 novembre 2026** : OpenDives se connecte au cloud Subsurface existant et ne le remplace pas. Il lit et écrit les données des utilisateurs Subsurface.
3. **Licence** : réutiliser `core` oblige OpenDives à être en GPLv2. libdivecomputer seule (LGPL-2.1) laisse plus de liberté, mais impose des règles de liaison qui sont délicates sur iOS. Je ne suis pas juriste : ce point mérite une vérification.
4. **Plateformes** : mobile seulement (Android et iOS) ou aussi bureau et Web ? Une montre ?
5. **Compétences** : quels langages maîtrisez-vous, vous ou les contributeurs visés (Dart, Kotlin, Swift, TypeScript, C++) ?

| Option | Interface | Accès au cœur C++ et à libdivecomputer | BLE et USB | Avantages | Inconvénients |
| --- | --- | --- | --- | --- | --- |
| A. Qt 6 / QML (refonte de l'interface seulement) | QML, Qt Quick Controls (Material, iOS) | Direct, 100 % réutilisé | Qt Bluetooth, déjà en place | Réutilisation maximale, compatibilité totale, chemin le plus court | Reste en GPLv2, build lourd, petit vivier de développeurs, rendu moins natif |
| B. Flutter (Dart) | Material 3 et Cupertino, rendu personnalisé (Impeller) | `dart:ffi` vers une bibliothèque C/C++ (libdivecomputer, éventuellement `core` sans Qt) | Plugins BLE (flutter_blue_plus) branchés sur les entrées/sorties personnalisées de libdivecomputer ; USB via un plugin Android | Une seule base de code d'interface, fluide, graphiques de profil performants, gros écosystème | Pont FFI à construire et maintenir ; `core` dépend encore de Qt, ce qui demande un travail d'extraction |
| C. Kotlin Multiplatform + Compose Multiplatform | Compose (Android natif, iOS stable) | cinterop (iOS) et JNI (Android) vers libdivecomputer | API BLE natives, ou Kable | Métier partagé en Kotlin, interface Android 100 % native, adoption en hausse | Métier à réécrire ou à ponter, outillage iOS moins mûr que Flutter |
| D. React Native (nouvelle architecture) | Composants natifs, écosystème Expo | Modules natifs C++ via JSI / Turbo Modules | react-native-ble-plx | Très grand vivier JavaScript/TypeScript, proche du Web | Graphiques de profil lourds à optimiser, deux couches de pont (JS et natif) |
| E. Natif : SwiftUI + Jetpack Compose sur un cœur C++ partagé | 100 % natif sur chaque plateforme | Direct (C++ dans Swift et via JNI) | Core Bluetooth et Android BLE | Meilleure expérience et intégration système (widgets, montre) | Deux interfaces à écrire et maintenir, coût double |
| F. Hybride : Capacitor (avec Ionic ou non) ou Tauri 2 | HTML/CSS/TypeScript (React, Vue, Svelte, Angular) dans une vue Web native | Plugin natif maison (Swift/Kotlin ou Rust pour Tauri) qui encapsule libdivecomputer, libgit2 et éventuellement core | Plugins BLE natifs (fonctionnent sur iOS) ; USB via plugin Android ; requêtes réseau natives, donc sans contrainte CORS | Réutilise des compétences Web ; la même interface (Capacitor) peut aussi être hébergée comme version Web ; grand écosystème JavaScript | Pont natif à écrire pour iOS et Android ; graphiques de profil à optimiser (canvas/WebGL) ; rendu moins natif. Tauri ne vise pas le serveur |
| G. App Web pure (PWA) servie par un serveur | HTML/CSS/TypeScript dans le navigateur, installable | libdivecomputer compilée en WebAssembly, ou core exécuté côté serveur | Web Bluetooth et WebUSB seulement dans Chrome sur Android et ordinateur ; impossible sur iPhone sans outil tiers (Bluefy, WebBLE) | Aucune installation via les magasins d'apps, mises à jour instantanées, accessible sur tout écran | CORS fermé sur le cloud Subsurface (testé), donc serveur relais obligatoire qui détient identifiants et carnets ; pas de téléchargement depuis l'ordinateur de plongée sur iPhone |

**Conséquences de la décision de se connecter au cloud Subsurface**

- OpenDives doit embarquer un **client Git** (libgit2, comme Subsurface-mobile) et parler HTTPS aux serveurs `ssrf-cloud-*.subsurface-divelog.org`. Il n'existe pas d'API REST : le dépôt Git **est** l'interface.
- Le **format de stockage Git** de Subsurface (arborescence `année/mois/…`, fichiers texte par plongée, `00-Subsurface`, `01-Divesites`) doit être reproduit à l'octet près, sinon l'app de bureau et Subsurface-mobile risquent de corrompre ou de rejeter les données. La référence est `core/load-git.cpp` et `core/save-git.cpp`. Les données inconnues doivent être conservées telles quelles.
- Il faut reprendre le **cycle de compte** : identifiants e-mail et mot de passe, validation par PIN (`/verify`), réinitialisation du mot de passe, choix du serveur US ou EU, et cache local hors ligne avec fusion des modifications concurrentes, y compris la protection `classify_git_save`.
- Cela favorise fortement la réutilisation du `core` C++ (chargement et sauvegarde Git déjà testés), donc les options A, B (via FFI), E et F (via plugin natif). Les options C et D restent possibles, mais il faudrait soit réécrire le parseur et le sérialiseur Git, soit ponter le `core`.
- La licence : réutiliser `load-git` et `save-git` place OpenDives sous GPLv2. Il serait aussi courtois d'informer les mainteneurs de Subsurface, qui financent eux-mêmes les serveurs, qu'un nouveau client va s'y connecter.

**Test CORS du 5 novembre 2026.** Le test a été fait depuis le navigateur intégré (Chromium), avec des requêtes `fetch` vers `/git/<compte>/info/refs?service=git-upload-pack` sur `ssrf-cloud-eu`, `ssrf-cloud-us` et `cloud.subsurface-divelog.org`. Les trois serveurs sont joignables, mais **aucun n'envoie d'en-tête ****`Access-Control-Allow-Origin`**. La requête simple et le pré-contrôle `OPTIONS` (avec `Authorization`) sont tous deux bloqués par le navigateur. Une app Web exécutée dans un navigateur ne peut donc pas accéder directement au cloud Subsurface : il faut soit une app native ou hybride (requêtes faites côté natif), soit un serveur relais.

**Observations pour guider votre choix (sans trancher).**

- La pièce à ne pas réécrire est libdivecomputer. Toutes les options l'appellent en C. La vraie différence est le coût du pont et la gestion du BLE côté plateforme.
- La compatibilité avec le cloud Subsurface étant requise, la réutilisation de core (Git, XML, modèle) devient le facteur décisif. C'est direct avec A et E, faisable avec B via FFI, et coûteux avec C et D.
- Pour « une version améliorée » centrée sur l'expérience mobile, B et C offrent le meilleur rapport entre qualité d'interface et code partagé. A est le plus rapide si l'objectif est surtout de moderniser l'interface en gardant tout le reste.

Une fois votre choix fait, l'étape 3 proposera l'architecture d'OpenDives (couches, modules, pont natif, synchronisation, modèle de données) à partir de la rétro-ingénierie de Subsurface-mobile.

## Sources

- [Dépôt Subsurface sur GitHub](https://github.com/subsurface/subsurface), commit `258beb4` du 4 novembre 2026
- [Fork libdivecomputer de Subsurface](https://github.com/Subsurface/libdc)
- [Site Subsurface — accueil](https://subsurface-divelog.org/), [Version actuelle](https://subsurface-divelog.org/current-release/), [FAQ](https://subsurface-divelog.org/faq/), [Politique de confidentialité](https://subsurface-divelog.org/privacy-policy/), [Participer](https://subsurface-divelog.org/contribute/), [Notes de version](https://subsurface-divelog.org/release-changes/)
- [Manuel de Subsurface-mobile](https://subsurface-divelog.org/subsurface-mobile-user-manual/)
- [Subsurface-mobile sur l'App Store](https://apps.apple.com/app/id1093217161)
