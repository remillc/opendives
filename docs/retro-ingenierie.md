# OpenDives — Rétro-ingénierie fonctionnelle de Subsurface

2026-11-05 · Christian Rémillard

## 1. Résumé et périmètre

Subsurface couvre **13 domaines fonctionnels** et environ 75 actions annulables. L'app mobile n'en couvre qu'une partie. OpenDives, qui sera une app complète, doit viser l'ensemble. Ce document décrit **ce que** fait Subsurface (fonctions, données, règles, intégrations), jamais **comment** ses écrans le présentent : l'interface d'OpenDives sera conçue à part, sur une page blanche.

- **Analysé :** l'app de bureau et l'app mobile, à partir du code (`core/`, `commands/` qui recense chaque action annulable, `stats/`, `profile-widget/`), du manuel utilisateur (bureau, 5 600 lignes) et du manuel mobile v3. Le commit de référence est `258beb4` du 4 novembre 2026.
- **Décisions déjà prises :** OpenDives se connecte au cloud Subsurface existant, utilise Capacitor (interface Web dans une app native), et le cœur C++ de Subsurface sera réutilisé ou reproduit pour rester compatible.
- **Ce qui suit :** à partir du catalogue (section 2), vous choisirez les fonctions de la première version. L'architecture (étape 4) et la conception de l'interface (étape 5) pourront alors avancer en parallèle.

Tout n'a pas sa place sur un téléphone : la section 2 classe chaque fonction en niveaux (essentiel, adapté, peu pertinent, impossible, nouveau). Ce classement a été validé.

## 2. Catalogue des fonctions

Le bureau couvre les 13 domaines ; le mobile en couvre environ la moitié, souvent partiellement. « Partiel » signifie que la fonction existe sur mobile avec moins d'options que sur le bureau.

| Domaine | Fonctions | Bureau | Mobile |
| --- | --- | --- | --- |
| 1. Carnet | Liste des plongées, colonnes configurables, tri, numérotation et renumérotation, sélection multiple, suppression, décalage de l'heure d'un lot de plongées | Oui | Partiel (liste, suppression) |
| 2. Saisie et édition | Ajout manuel ; date, durée, profondeur, site, guide(s), compagnons, combinaison, tags, notes, note globale et notes de conditions (visibilité, houle, courant, ressac, froid), températures air et eau, pression atmosphérique, type d'eau, mode de plongée, plongée invalide ; **édition de plusieurs plongées à la fois** ; copier-coller de champs entre plongées | Oui | Partiel (une plongée, champs principaux) |
| 3. Équipement | Bouteilles (volume, pression de service, mélange O2/He, pressions début et fin, usage OC, diluant ou O2), lests, association capteur de pression → bouteille, renommer un type de bouteille, bouteille par défaut | Oui | Partiel |
| 4. Profil et événements | Profil détaillé avec couches activables (plafond, tissus, ppO2/ppN2/ppHe, MOD, EAD, NDL/TTS, SAC, rythme cardiaque, pression des bouteilles, capteurs CCR) ; règle de mesure ; ajout de signets, changement de gaz, changement de setpoint ou de mode ; renommer ou masquer un événement ; dessiner un profil à la main | Oui | Partiel (profil en lecture) |
| 5. Opérations sur les plongées | Fusionner des plongées, découper une plongée à un instant, séparer ou supprimer un ordinateur, choisir l'ordinateur principal, appliquer des positions GPS | Oui | Non |
| 6. Ordinateurs de plongée | Téléchargement USB, Bluetooth classique et BLE (environ 366 modèles), « nouvelles plongées seulement » ou tout retélécharger, plusieurs ordinateurs par plongée, surnoms d'appareils, configuration de certains modèles (OSTC, Suunto Vyper) | Oui | Partiel (téléchargement, 4 appareils mémorisés) |
| 7. Sites de plongée | Créer, modifier (nom, description, notes, GPS, pays et région), fusionner des doublons, supprimer les sites inutilisés, import et export (XML, KML), carte de tous les sites, recherche de sites proches | Oui | Partiel (carte, choix du site) |
| 8. Voyages | Regroupement automatique (écart de 3 jours au plus), créer, fusionner, scinder, ajouter ou retirer des plongées, lieu et notes du voyage | Oui | Partiel (édition lieu et notes) |
| 9. Médias | Photos et vidéos liées à une plongée, synchronisation horaire appareil photo ↔ ordinateur, affichage sur le profil, position GPS issue de l'EXIF, fichiers déplacés | Oui | Non |
| 10. Recherche et filtres | Recherche plein texte ; filtres combinables sur 33 critères (date, profondeur, durée, SAC, gaz, bouteille, personnes, tags, site, ordinateur, mode, notes de conditions…) ; filtres enregistrés | Oui | Partiel (plein texte) |
| 11. Statistiques | Graphiques configurables (barres, histogrammes, nuages de points avec régression, boîtes à moustaches, camemberts) sur environ 30 variables ; résumé par période ; statistiques annuelles | Oui | Oui |
| 12. Planification et gaz | Planificateur OC, pSCR et CCR, avec gaz de secours, plongées successives, Bühlmann ZH-L16 avec facteurs de gradient ou VPM-B ; replanifier une plongée ; impression du plan ; calculateur de gaz (MOD, meilleur mélange) | Oui | Partiel |
| 13. Import, export, cloud | Import d'autres carnets et formats (section 6) ; export XML, UDDF, CSV, HTML, carte du monde, LaTeX/TeX, images de profil, divelogs.de ; impression avec gabarits ; cloud Subsurface, plusieurs utilisateurs sur un poste | Oui | Partiel (export, cloud, import de fichier) |

Toutes les modifications du bureau passent par une pile **annuler / rétablir** (environ 75 commandes dans `commands/`). Les textes de ces commandes servent aussi de message de commit Git lors de la synchronisation.

### Pertinence sur mobile (validée le 5 novembre 2026)

Une app complète ne veut pas dire tout reproduire à l'identique : certaines fonctions du bureau n'ont pas de sens sur un téléphone, d'autres doivent être simplifiées, et le mobile offre des possibilités que le bureau n'a pas. Je propose quatre niveaux. La colonne « Tablette » indique ce qu'un grand écran pourrait récupérer.

| Niveau | Fonctions | Tablette |
| --- | --- | --- |
| **Essentiel** : le cœur de l'usage mobile | Téléchargement BLE ; saisie rapide (site, compagnons, guide, bouteilles, note) ; liste et recherche plein texte ; profil en lecture avec événements ; synchronisation cloud et hors ligne ; voyages ; sites et carte ; calculateur de gaz (MOD, meilleur mélange) ; annuler ; filtres sur tous les critères, matériel compris, et statistiques sur les plongées filtrées | Idem |
| **Adapté** : utile, mais sous une forme simplifiée | Édition de plusieurs plongées (sélection puis champs communs) ; planificateur (récréatif et déco OC d'abord, CCR et pSCR ensuite) ; fusion et découpage de plongées ; import de fichiers courants (XML, UDDF, FIT) ; export et partage via la feuille de partage du système ; couches du profil (sélection réduite) | Version plus complète |
| **Peu pertinent** : à laisser au bureau ou à une éventuelle version Web | Impression et gabarits personnalisés ; exports TeX, LaTeX, HTML, carte du monde ; import CSV universel avec correspondance des colonnes ; import SmartTrak et autres bases de logiciels de bureau ; colonnes configurables de la liste ; dessin d'un profil à la main ; configuration des ordinateurs (OSTC, Vyper) ; plusieurs utilisateurs sur un appareil ; gestion des médias sur disque externe | Possible pour certains (import CSV, dessin de profil) |
| **Impossible ou limité par la plateforme** | USB série et Bluetooth classique sur iPhone (BLE seulement) ; ligne de commande | — |
| **Nouveau, propre au mobile** (absent ou retiré de Subsurface) | Position GPS du site prise par le téléphone sur le bateau ; photos et vidéos depuis la galerie, synchronisées avec le profil ; partage d'une plongée en image ; widget d'écran d'accueil ; carte hors ligne ; rappels (intervalle de surface, désaturation avant un vol) | Idem |

Deux conséquences pour la suite. Les fonctions « peu pertinentes » doivent quand même **préserver les données** qu'elles produisent : une plongée avec un profil dessiné au bureau doit rester intacte après une modification sur mobile. Et l'architecture doit permettre d'ajouter plus tard une version tablette ou Web plus riche, sans refaire le cœur.

**Décidé le 5 novembre 2026 : filtres et statistiques complets partout.** Sur toutes les versions (téléphone et tablette), on peut filtrer les plongées selon tous les critères, matériel compris, et afficher les statistiques des résultats filtrés. Exemple : combien de plongées avec une combinaison étanche donnée. Le cœur de Subsurface le permet déjà : la combinaison, le type et la taille de bouteille, le type de lest et l'ordinateur font partie des 33 critères de filtre, et les statistiques portent sur les plongées visibles après filtrage. Seule la présentation change entre téléphone et tablette, pas les possibilités.

Précisions du 5 novembre 2026 :

- **Mode de plongée** : le filtre circuit ouvert ou recycleur est mis en avant (critère « mode » de Subsurface, qui distingue aussi pSCR et apnée).
- **Lest** : pas de filtre sur le poids ni sur le type de lest dans OpenDives. Le cœur garde ces critères, ils ne sont simplement pas proposés.
- **Autre matériel** (détendeur, stab, palmes, lampe…) : Subsurface n'a pas de champ pour eux. On les note par des **étiquettes** sur la plongée (par exemple « Détendeur : … »), qu'on peut filtrer et compter, sans casser la compatibilité.

## 3. Modèle de données

Un **journal** contient des plongées, des voyages, des sites, des appareils et des filtres enregistrés. Chaque plongée réunit les données d'un ou plusieurs ordinateurs. OpenDives doit reprendre ce modèle tel quel pour rester compatible avec le cloud.

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Journal (`divelog`) | Réglage de regroupement automatique | Contient tout le reste |
| Plongée (`dive`) | Numéro, date et heure, durée, profondeurs max et moyenne, températures, pression de surface, salinité, notes, guide(s), compagnons, combinaison, note 0-5, conditions 0-5 (visibilité, houle, courant, ressac, froid), SAC, CNS, OTU, invalide, « hors voyage » | 0-1 voyage, 0-1 site ; n bouteilles, n lests, n tags, n photos ; **1 à n ordinateurs** |
| Ordinateur dans la plongée (`divecomputer`) | Modèle, n° de série, firmware, identifiants appareil et plongée, mode (OC, CCR, pSCR, apnée), nombre de cellules O2, fuseau horaire, salinité | n échantillons, n événements, données supplémentaires clé-valeur, correspondance capteur → bouteille |
| Échantillon (`sample`) | Temps, profondeur, température, pressions (10 capteurs max), setpoint et 6 cellules ppO2, NDL, TTS, RBT, arrêt de déco, CNS, cap, rythme cardiaque, en déco | Appartient à un ordinateur |
| Événement (`event`) | Temps, type, nom, valeur, masqué ; changement de gaz (bouteille, mélange) ou de mode | Appartient à un ordinateur |
| Bouteille (`cylinder`) | Type (volume, pression de service, description), O2/He, pressions début/fin (saisies et mesurées), usage (OC, diluant, O2), profondeur de changement | Appartient à une plongée |
| Lest (`weightsystem`) | Poids, description (ceinture, intégré…) | Appartient à une plongée |
| Site (`dive_site`) | Identifiant (uuid), nom, GPS, description, notes, taxonomie (pays, région, ville) | Partagé par n plongées |
| Voyage (`dive_trip`) | Lieu, notes, créé automatiquement ou non | Regroupe n plongées |
| Photo ou vidéo (`picture`) | Nom de fichier, décalage dans la plongée, GPS | Appartient à une plongée (le fichier lui-même n'est pas dans le cloud) |
| Appareil (`device`) | Modèle, n° de série, surnom | Niveau journal |
| Filtre enregistré | Nom, texte, liste de contraintes | Niveau journal |

**Conventions à respecter.** Les unités internes sont des entiers SI fins (mm, mK, mbar, ml, g, secondes) ; la conversion métrique/impérial ne se fait qu'à l'affichage. Les dates sont en secondes, en heure locale de la plongée, sans fuseau. Les photos et vidéos ne sont référencées que par leur chemin de fichier : le cloud Subsurface ne les stocke pas.

## 4. Règles métier et calculs

Ces règles déterminent les chiffres que voit le plongeur. OpenDives doit produire **exactement les mêmes résultats** que Subsurface, sinon une même plongée afficherait des valeurs différentes selon l'app. C'est un argument fort pour réutiliser `core` plutôt que de le réécrire.

| Règle | Comportement dans Subsurface | Source |
| --- | --- | --- |
| Début et fin de plongée | La plongée ne compte qu'en dessous de 75 cm | `divecomputer.h` (`SURFACE_THRESHOLD`) |
| Valeurs dérivées | Profondeur max et moyenne, durée, températures min et max, recalculées à partir des échantillons (`fixup_dive`) ; la température d'eau est la moyenne des ordinateurs | `dive.cpp` |
| Doublons à l'import | Deux plongées sont jugées « identiques » si l'ordinateur concorde (même modèle, même identifiant d'appareil et de plongée). Sinon, il faut une profondeur à 1 m près, une durée à 5 min près et des horaires qui se chevauchent. Les plongées saisies à la main ne sont jamais fusionnées automatiquement | `dive::likely_same`, `match_one_dc` |
| Options d'import | Préférer les données importées, marquer comme téléchargé, fusionner dans les voyages existants, ou créer un nouveau voyage | `import_flags` |
| Voyages automatiques | Plongées regroupées si elles sont à moins de 3 jours l'une de l'autre, sauf si la plongée est marquée « hors voyage » | `trip.cpp` (`TRIP_THRESHOLD`) |
| Numérotation | Numéro suivant attribué à l'ajout ; renumérotation à la demande | `divelist.cpp` |
| Consommation (SAC) | Gaz consommé (volume réel, avec facteur de compressibilité du gaz) ÷ pression à la profondeur moyenne ÷ durée, sur le premier ordinateur. Pas de SAC si une bouteille utilisée n'a pas de pression de fin | `calculate_sac`, `gas-model.cpp` |
| Pressions des bouteilles | Interpolation entre pressions mesurées ou saisies, selon le temps passé sur chaque gaz | `gaspressures.cpp` |
| Densité de l'eau | Douce 1,000 ; saumâtre 1,010 ; norme EN13319 1,020 ; mer 1,030 kg/l, ou valeur de l'ordinateur | `units.h` |
| Décompression | Bühlmann ZH-L16 avec facteurs de gradient (GF bas et haut) ou VPM-B avec conservatisme ; tissus hérités des plongées des 48 h précédentes ; CNS et OTU | `deco.cpp`, `divelist.cpp` |
| Planificateur | Vitesses de descente et de remontée, dernier palier, durée minimale de changement de gaz, SAC de fond et de déco, choix automatique du gaz selon la ppO2 maximale, gaz de secours pour pSCR et CCR | `planner.cpp`, `plannernotes.cpp` |
| Gaz | MOD selon la ppO2 maximale, MND et END, meilleur mélange O2/He pour une profondeur | `dive.cpp` (`gas_mod`, `best_o2`, `best_he`) |
| Filtres | 33 critères combinés par ET ; opérateurs égal, moins, plus, entre, commence par, contient, exact, négation | `filterconstraint.h` |
| Statistiques | Une variable en abscisse, une en ordonnée, regroupement par catégorie (année, mois, gaz, site, personnes…) | `stats/statsvariables.cpp` |

## 5. Parcours utilisateur exprimés en tâches

Les tâches ci-dessous décrivent ce que le plongeur veut accomplir, déduit des fonctions et des manuels. Aucune ne suppose d'écran particulier : ce sont les entrées de la conception d'interface (étape 5). Elles sont classées par moment de la vie du plongeur.

| Moment | Tâche | Domaines (section 2) |
| --- | --- | --- |
| Première utilisation | Se connecter à son compte Subsurface existant et retrouver tout son carnet, ou créer un compte (PIN par courriel), ou travailler sans cloud | 13 |
| Première utilisation | Associer son ordinateur de plongée une fois pour toutes | 6 |
| Avant la plongée | Planifier une plongée (profondeur, gaz, déco), vérifier la MOD d'un mélange, voir la saturation restante des plongées précédentes | 12 |
| Sur le bateau | Télécharger les nouvelles plongées de la journée, hors ligne | 6 |
| Sur le bateau | Noter rapidement le site, les compagnons, le guide, les bouteilles et la note de la plongée | 2, 3, 7 |
| Le soir | Revoir le profil, relire les événements (alarmes, changements de gaz), comparer avec un compagnon ou un second ordinateur | 4, 5 |
| Le soir | Ajouter des photos et vidéos à la bonne plongée et au bon moment | 9 |
| Le soir | Corriger une plongée : découper un intervalle de surface mal détecté, fusionner deux téléchargements, décaler l'heure | 5 |
| Fin du voyage | Regrouper les plongées en voyage, donner un nom et des notes, compléter plusieurs plongées d'un coup | 2, 8 |
| À la maison | Importer l'historique d'un autre carnet ou d'un ancien ordinateur | 13 |
| À la maison | Nettoyer les sites (fusionner les doublons, ajouter le GPS et le pays) | 7 |
| À tout moment | Retrouver une plongée (texte, filtres), consulter les statistiques, voir ses sites sur une carte | 7, 10, 11 |
| À tout moment | Partager ou exporter (fichier, image du profil, divelogs.de), imprimer un carnet | 13 |
| À tout moment | Retrouver les mêmes données dans Subsurface sur l'ordinateur, sans conflit | 13 |
| À tout moment | Annuler une erreur | Transversal |

## 6. Intégrations externes et format Git du cloud

Subsurface dépend de cinq services externes et lit une vingtaine de formats. Le cloud est l'intégration critique : son format doit être reproduit fidèlement.

| Intégration | Usage | Point d'entrée |
| --- | --- | --- |
| Cloud Subsurface | Stockage et synchronisation du carnet ; compte, PIN, mot de passe, suppression du compte | Git sur HTTPS, `https://ssrf-cloud-{eu,us}.subsurface-divelog.org/git/<e-mail>[<e-mail>]` ; `/verify` et `/passwordreset` |
| GeoNames | Pays, région, ville ou océan à partir des coordonnées GPS d'un site | `secure.geonames.org` (`findNearbyPlaceNameJSON`, `findNearbyJSON`, `oceanJSON`) |
| Fonds de carte | Carte des sites | Google Maps via Qt Location, avec cache local |
| divelogs.de | Import et envoi de plongées | `divelogs.de/api/login`, `/api/dives` |
| DiveShare | Partage public d'une plongée | `dive-share.appspot.com/upload` (service ancien, à vérifier) |

**Formats d'import** : XML Subsurface, UDDF, CSV (import universel avec correspondance des colonnes), Suunto DM3/DM4/DM5 et app Suunto (JSON), Shearwater Desktop, DivingLog, SeacSync, LogTRAK, Atomic Cobalt, Scubapro ASD, DataTrak/Wlog, Liquivision, Cochran, Uemis, Divesoft, OSTCtools, Garmin FIT, SmartTrak, Mares Dive Organizer, GPX (positions GPS).

**Formats d'export** : XML Subsurface (plongées ou sites seuls), UDDF, KML des sites, CSV (résumé, profils, données du profil), image du profil, HTML (avec statistiques annuelles), carte du monde HTML, TeX et LaTeX, liste photo-profondeur, impression avec gabarits HTML/CSS modifiables.

**Format Git du cloud**

- **Dépôt** : une branche nommée d'après l'e-mail du compte. Chaque sauvegarde est un commit dont le message reprend les actions annulées ou rétablies (`changesMade`).
- **Arborescence** : `00-Subsurface` (version du format, appareils, empreintes de téléchargement, unités, regroupement automatique, quelques options du profil), `01-Divesites/Site-<uuid hex>`, `02-Filterpresets/``Preset-NNN`, puis `AAAA/MM/`. Une plongée hors voyage est un dossier `JJ-Jour-HH=MM=SS` (`=` remplace `:`, interdit sous Windows). Un voyage a son propre dossier, avec sa description et ses plongées. Les dates des dossiers sont celles du début de la plongée, ou du voyage.
- **Fichiers d'une plongée** : `Dive` (en-tête : date, durée, profondeurs, site, bouteilles, lests, personnes, tags, notes…), puis `Divecomputer`, `Divecomputer-001`… (échantillons et événements en texte ligne par ligne), et un dossier `Pictures` avec un fichier par photo, nommé d'après son décalage dans la plongée. Les **empreintes** (`fingerprint`) permettent de ne télécharger que les nouvelles plongées d'un ordinateur, même depuis un autre appareil.
- **Synchronisation** : récupération, puis avance rapide si possible. Sinon, fusion automatique de libgit2 (commit « Automatic merge »). Les conflits sont résolus par fichier : une suppression d'un côté l'emporte ; sinon un côté est gardé. Une sauvegarde qui écraserait des données sans rapport exige une confirmation (`classify_git_save`).
- **Cache local** : un clone complet sur l'appareil, utilisable hors ligne, synchronisé à la demande ou automatiquement.
- **Références pour OpenDives** : `core/load-git.cpp`, `core/save-git.cpp`, `core/git-access.cpp` et les tests `tests/testgitstorage.cpp`.

## 7. Exigences transversales

Ces exigences touchent toutes les fonctions. Les premières sont héritées de Subsurface ; les dernières sont des manques à combler dans OpenDives.

| Exigence | Ce que fait Subsurface | Pour OpenDives |
| --- | --- | --- |
| Hors ligne d'abord | Clone Git complet sur l'appareil ; tout fonctionne sans réseau, synchronisation ensuite | Indispensable (bateau, îles, pays sans forfait) |
| Unités | Métrique, impérial ou choix par grandeur (profondeur, pression, volume, température, poids) ; stockage toujours en SI | À reprendre ; le choix d'unités est aussi enregistré dans `00-Subsurface` |
| Langues | 34 traductions via Transifex ; manuels en EN, FR, DE, ES, NL | Français et anglais au minimum ; réutiliser les traductions de termes métier si la licence le permet |
| Réglages | Environ 90 réglages : unités, bouteille par défaut, GF bas et haut, conservatisme VPM-B, ppO2 maximales, SAC par défaut, couches du profil, carte, réseau, cloud | Garder les réglages qui changent les calculs ; simplifier les autres |
| Annuler et rétablir | Toutes les modifications sur le bureau ; le texte des actions sert de message de commit | À reprendre, y compris sur mobile |
| Intégrité des données | Pas de perte lors des fusions ; confirmation avant d'écraser des données sans rapport | Conserver aussi les données que l'app ne sait pas afficher |
| Volume | Carnets de plusieurs milliers de plongées ; échantillons toutes les 1 à 10 s, sur plusieurs ordinateurs | Liste et profil fluides sur un téléphone moyen ; chargement progressif |
| Support | Envoi des journaux techniques par courriel, menu développeur | À reprendre, avec le consentement de l'utilisateur |
| Sécurité | Mot de passe cloud enregistré dans les réglages de l'app, sans trousseau système | **À améliorer** : trousseau iOS et Keystore Android |
| Accessibilité | Mise à l'échelle de l'interface, taille de police | **À combler** : lecteurs d'écran, contrastes, cibles tactiles adaptées aux mains mouillées |

## 8. Questions ouvertes

Ces décisions vous reviennent avant l'architecture (étape 4) ou au début de la conception d'interface (étape 5).

1. **Première version** : parmi les fonctions « essentielles » et « adaptées », lesquelles sont indispensables pour une première publication ?
   **Décidé le 5 novembre 2026** : toutes les fonctions « essentielles » et « adaptées » de la section 2 font partie de la première version.
2. **Classification mobile** : le tableau « Pertinence sur mobile » (section 2) range chaque fonction dans un niveau (essentiel, adapté, peu pertinent…). Êtes-vous d'accord avec ce rangement, ou faut-il déplacer certaines fonctions ? Par exemple, j'ai mis l'impression en « peu pertinent » et le planificateur en « adapté ». Faut-il prévoir une version tablette dès le départ ?
   **Décidé le 5 novembre 2026** : une version tablette est prévue dès le départ. La colonne « Tablette » de la section 2 s'applique donc à la première version. Le classement par niveaux est validé tel quel.
3. **Nouveautés mobiles** : quelles fonctions propres au mobile (GPS du site, photos de la galerie, widget, carte hors ligne, rappels) voulez-vous en priorité ?
   **Décidé le 5 novembre 2026** : toutes les nouveautés mobiles sont retenues pour la première version (GPS du site, photos de la galerie, partage en image, widget, carte hors ligne, rappels).
4. **Mode sans cloud** : OpenDives doit-il fonctionner sans compte Subsurface (carnet local seul, export ou import manuel) ?
   **Décidé le 5 novembre 2026** : oui, OpenDives fonctionne aussi sans compte Subsurface, avec un carnet local et l'import ou l'export manuel. Il faudra pouvoir passer plus tard d'un carnet local à un compte cloud sans perdre de données.
5. **Photos** : le cloud ne stocke pas les fichiers médias. Les garder sur l'appareil seulement, ou prévoir une solution de stockage (iCloud, Google Photos, autre) ?
   **Décidé le 5 novembre 2026** : les photos et vidéos restent sur l'appareil, et seule leur référence est synchronisée, comme dans Subsurface. Sur un autre appareil, la plongée indiquera qu'une photo existe sans pouvoir l'afficher.
6. **Services externes** : garder GeoNames et divelogs.de ? Quel fournisseur de cartes (Google Maps comme Subsurface, ou OpenStreetMap, gratuit et utilisable hors ligne) ?
   **Décidé le 5 novembre 2026** : GeoNames et divelogs.de sont gardés. Pour divelogs.de, il s'agit de reprendre ce que fait Subsurface (import et envoi de plongées), sans synchronisation : le cloud Subsurface reste la seule source de données. Les cartes utilisent OpenStreetMap, ce qui permet aussi la carte hors ligne.
7. **Relation avec Subsurface** : informer les mainteneurs avant de connecter un nouveau client à leurs serveurs ? Contribuer au projet (par exemple, rendre `core` indépendant de Qt) plutôt que de le copier ?
   **Décidé le 5 novembre 2026** : rien pour l'instant ; on ne contacte pas les mainteneurs et on ne contribue pas au projet. À revoir avant la publication.
8. **Coexistence** : OpenDives et Subsurface-mobile sur le même téléphone avec le même compte : est-ce un cas à gérer explicitement ?
   **Décidé le 5 novembre 2026** : oui, la coexistence est gérée explicitement :
   - conserver intégralement les données qu'OpenDives ne connaît pas ;
   - synchroniser souvent et signaler les conflits résolus ;
   - lire sans écrire si le format a une version plus récente ;
   - libérer la connexion Bluetooth après chaque téléchargement ;
   - s'appuyer sur les empreintes et la détection de doublons ;
   - signer les commits « OpenDives ».
