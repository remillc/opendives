# OpenDives — Spécification de l'interface pour le code

2026-11-05 · Christian Rémillard

Ce document traduit les maquettes en règles que le code applique telles quelles : couleurs, textes, mesures, composants, écrans et données demandées au cœur. Il s'adresse d'abord à l'agent de code qui construit l'app (Svelte 5, Framework7 v9, JavaScript avec JSDoc), et à toi pour validation.

- **Ordre de priorité :** ce document, puis les [maquettes](https://claude.ai/artifact/Jpuj8pGER3xz8n383JvYep), puis les [fondations de l'interface](https://claude.ai/artifact/8goh1sZMXM9npSVThnA61r). En cas d'écart, ce document gagne ; une maquette qui le contredit est à signaler.
- **Natif d'abord :** tout ce que Framework7 fournit (barres, listes, feuilles, boutons, champs) est utilisé tel quel, avec son thème iOS ou MD3. Seuls les composants de la section 4 sont propres à OpenDives.
- **Pas encore figé :** les couleurs sont une piste à valider sur un vrai téléphone, en plein soleil et la nuit ; les points ouverts sont marqués **À trancher**.

## 1. Couleurs

La palette retenue le 5 novembre 2026 est **sapin et mandarine sur fond crème** : le sapin donne la confiance et la maîtrise, la mandarine l'envie de replonger. Elle n'évoque ni l'eau ni le ciel. Le code déclare chaque couleur une seule fois, comme variable CSS `--od-*`, et ne met jamais de valeur en dur dans un composant.

| Jeton | Clair | Sombre | Usage, et seulement celui-là |
| --- | --- | --- | --- |
| `--od-sapin` | #1E4D3A | #8FCFAE | Couleur principale : liens, boutons, onglet actif ; bas de la colonne d'eau |
| `--od-sapin-clair` | #BFD9CB | #BFD9CB | Haut de la colonne d'eau |
| `--od-mandarine` | #F06A1D, texte et icônes #1A1A1A dessus (5,6:1) | #F06A1D | Action principale d'un écran (Télécharger dans l'écran de téléchargement, Réessayer, Planifier) ; curseur du profil ; une fois par écran au plus |
| `--od-teinte` | #DDEBE3, texte #153829 | #173528, texte #CDEBDB | Fond d'un bouton secondaire, d'une puce de compagnon, de l'élément sélectionné de la barre latérale |
| `--od-alarme` | #C62828 | **À trancher** | Plafond dépassé, remontée rapide, réserve de gaz insuffisante, erreurs ; jamais ailleurs |
| `--od-oxygene` | #2E7D32 | #7FD283 | Courbe de ppO2, mélanges nitrox et oxygène ; **à vérifier** : il doit rester distinct du sapin dans le profil |
| `--od-attente` | #8A4B00 | **À trancher** | État « hors ligne, en attente d'envoi » ; texte seulement, toujours avec une icône, pour ne pas être confondu avec la mandarine |
| `--od-trace-profil` | #1E4D3A | #EAF5EF | Ligne du profil sur la colonne d'eau |

**Fonds crème.**

| Surface | iOS | Android |
| --- | --- | --- |
| Fond de l'écran | #F6F1E7 | #FAF6EE (surface) |
| Cellule, bloc | #FFFDF9 | #F0EADF (surface-container) |
| Barres | #FBF7F0 | #F0EADF |
| Séparateur | #DDD5C7, intérieur #EAE3D6 | #E2DACB (outline-variant) |
| Fond d'une miniature de profil | #F7F2E8 | #EAE4D8 (surface-variant) |

En mode sombre, les fonds restent ceux du système (noir et gris d'iOS, surfaces sombres de MD3) : le crème n'existe qu'en clair.

**Framework7.** Le thème se règle par `colors: { primary: '#1``E4D3A``' }` à la création de l'app : Framework7 en déduit la couleur iOS (`--f7-ios-primary`) et toute la palette MD3 (`--f7-md-primary`, `--f7-md-surface`, `--f7-md-secondary-container`…) en clair et en sombre. Les maquettes Android utilisent les rôles suivants ; les valeurs générées par Framework7 peuvent légèrement différer, et ce sont elles qui priment, sauf pour `primary`.

| Rôle MD3 | Clair | Sombre |
| --- | --- | --- |
| primary | #1E4D3A | #8FCFAE |
| surface | #FAF6EE | système |
| surface-container | #F0EADF | système |
| surface-variant | #EAE4D8 | système |
| outline-variant | #E2DACB | système |
| secondary-container | #CFE9D9 | #2C4A3B |
| on-secondary-container | #0B3A23 | #CFE9D9 |

Sur iOS, `--f7-ios-primary` vaut le sapin ; les fonds crème remplacent le gris groupé d'Apple en clair, et le texte secondaire reste celui du système (#3C3C43, 9,7:1 sur le crème). Les surfaces crème sont des surcharges des variables de Framework7 : à vérifier à l'écran (paragraphe suivant).

**Attention :** Framework7 réinjecte ses variables à l'initialisation, ce qui peut écraser une surcharge placée dans le CSS ([forum Framework7](https://forum.framework7.io/t/fully-custom-colors-by-overriding-css-variables/17429)). Les jetons `--od-*` ne posent pas ce problème ; une surcharge de `--f7-*` doit être vérifiée à l'écran, en clair et en sombre.

**Contraste :** tout texte à 4,5:1 minimum sur son fond, 3:1 pour un texte de 24 px et plus. Une couleur ne porte jamais seule une information : l'alarme et l'attente ont toujours un texte qui dit le problème.

## 2. Textes, chiffres et unités

Les polices sont celles du système : SF Pro sur iOS, Roboto sur Android. Les tailles suivent l'échelle de chaque plateforme et respectent la taille de texte choisie dans les réglages du téléphone.

| Rôle | iOS | Android (MD3) |
| --- | --- | --- |
| Grand titre d'écran | Large Title, 34 px gras | Headline small, 24 px |
| Titre de barre | 17 px demi-gras | Title large, 22 px |
| Titre de section dans une liste | 13 px, texte secondaire | Title small, 14 px medium, couleur primary |
| Ligne de liste | 17 px | Body large, 16 px |
| Texte d'appoint d'une ligne | 13 px, texte secondaire | Body medium, 14 px, on-surface-variant |
| Valeur mise en avant (calculateur, totaux) | 22 px demi-gras | 24 px |
| Légende, note sous un bloc | 13 px | Body small, 12 px |

**Chiffres.** Toute valeur de plongée (profondeur, durée, pression, température, volume, poids, pourcentages) utilise les chiffres tabulaires (`font-variant-numeric: tabular-nums`) et s'aligne à droite dans les listes et tableaux.

**Langues (décidé le 5 novembre 2026).** L'app est multilingue dès le départ, en français et en anglais ; d'autres langues s'ajouteront sans toucher au code.

- Aucun texte visible n'est écrit en dur dans un composant : chaque texte a une clé, et ses traductions vivent dans un fichier par langue (`app/src/i18n/fr.json`, `en.json`). Le français est la langue de référence pour écrire les textes.
- La langue suit celle de l'appareil ; une langue non traduite retombe sur l'anglais. Un réglage permet de la choisir.
- Les pluriels et les nombres passent par `Intl.PluralRules` et `Intl.NumberFormat` (« 1 plongée », « 3 plongées »).
- Les messages du cœur de Subsurface arrivent en anglais (`trGettext` renvoie le texte tel quel) : la façade les transforme en codes, et l'app les traduit comme ses propres textes.
- Les données du plongeur (noms de sites, notes, étiquettes comme « boat ») ne se traduisent jamais.
- Le vocabulaire de plongée anglais suit celui de Subsurface (dive computer, buddy, ceiling, SAC, MOD), pour que les deux apps parlent la même langue.

**Formats.** Ils suivent la langue de l'appareil, par `Intl.NumberFormat` et `Intl.DateTimeFormat` ; en français : virgule décimale (« 27,6 m »), espace insécable avant les unités et les deux-points, espace fine dans les milliers (« 1 013 mbar »). Le squelette affiche aujourd'hui « 4.1 m » : à corriger.

**Unités.** Chaque mesure suit son propre réglage, lu dans les préférences du carnet Subsurface : profondeur (m ou pieds), température (°C ou °F), pression (bar ou psi), volume (litres ou pieds cubes), poids (kg ou livres). Le cœur stocke en unités SI entières (mm, mK, mbar, ml, g) ; la conversion se fait au moment de l'affichage, jamais dans les données.

| Mesure | Précision affichée |
| --- | --- |
| Profondeur | 1 décimale en mètres, entier en pieds |
| Durée de plongée | minutes entières ; min:s dans le profil |
| Pression | entier |
| Température | 1 décimale |
| Volume, SAC | 1 décimale |

## 3. Mise en page et navigation

La largeur décide de la mise en page, pas le type d'appareil : sous 768 px de large, mise en page téléphone ; à partir de 768 px, mise en page tablette. Un téléphone plié ou déplié change donc de mise en page sans redémarrer.

|  | Téléphone | Tablette |
| --- | --- | --- |
| Navigation principale | iOS : barre d'onglets en bas ; Android : barre de navigation en bas (4 sections) | iOS : barre latérale de 220 px ; Android : rail de navigation de 96 px avec le bouton Télécharger en tête |
| Sections | Carnet, Sites, Statistiques, Outils ; Réglages s'ouvrent depuis le Carnet | Les mêmes, plus Réglages en bas de la barre |
| Carnet | Liste, puis détail en plein écran | Liste (340 px) et détail côte à côte |
| Sites | Carte, liste dans une feuille en bas | Liste à gauche, carte à droite |
| Outils | Liste des outils, puis planificateur en plein écran | Paramètres à gauche, plan calculé à droite |
| Modifier une plongée | Plein écran | iOS : feuille de 780 px sur deux colonnes ; Android : volet du contenu sur deux colonnes |
| Réglages | Liste qui défile | Colonne centrée de 600 px ; deux colonnes sur Android |

**Cibles tactiles :** 44 × 44 pt minimum sur iOS, 48 × 48 dp sur Android ; 56 px pour les lignes de liste utilisées sur le bateau (choix du site, compagnons).

**Espacements :** ceux des listes et blocs Framework7 ; marges latérales de 16 px sur téléphone, 24 à 32 px dans les volets de tablette. Pas de cartes à ombre : des listes natives pleine largeur, ou les listes groupées d'iOS.

**Retour :** le geste natif (balayage depuis le bord sur iOS, retour système sur Android) fonctionne partout ; une feuille se ferme aussi en la glissant vers le bas.

**Ajouter (décidé le 5 novembre 2026) :** le Carnet n'a plus de bouton Télécharger permanent, peu utile. À sa place, un bouton « + » (barre de navigation sur iOS, bouton d'action flottant en `secondary-container` sur Android, en tête du rail sur tablette) ouvre trois choix : télécharger depuis l'ordinateur de plongée, importer un fichier, noter une plongée à la main. Le carnet vide propose ces mêmes choix directement.

## 4. Composants propres à OpenDives

Six composants n'existent pas dans Framework7 ; chacun est un composant Svelte unique, partagé par iOS et Android, qui ne change que ses couleurs et ses tailles selon le thème.

**`<Profil>` : le profil de plongée et sa colonne d'eau.**

- **Tracé :** profondeur en fonction du temps, à partir des échantillons du premier ordinateur ; la surface en haut, la profondeur vers le bas.
- **Colonne d'eau :** la zone entre la surface et la courbe est remplie d'un dégradé vertical, de `--od-``sapin-clair` en haut à une couleur de fond qui dépend de la profondeur maximale : mélange de `--od-``sapin-clair` et `--od-sapin` dans la proportion profondeur max / 60 m, plafonnée à 1. La même échelle vaut pour toutes les plongées : une plongée à 40 m est visiblement plus sombre qu'une à 12 m.
- **Exploration :** un doigt posé sur le profil place un curseur vertical en `--od-``mandarin``e` et affiche le temps et la profondeur à cet instant, au-dessus du graphe.
- **Couches techniques :** Gaz, Plafond, ppO2, Tissus, en puces à cocher (filtres MD3, boutons iOS) ; une couche n'est proposée que si la plongée en contient les données. Gaz affiche une bande par mélange sous le profil ; ppO2 utilise `--od-oxygene` ; un plafond dépassé utilise `--od-alarme`.
- **Paysage :** sur téléphone, le passage en paysage ouvre le profil en plein écran.

**`<Miniature>` : la miniature du profil**, à la place d'une icône dans chaque ligne. 56 × 36 px sur iOS (coins de 4 px), 56 × 40 px sur Android (coins de 8 px). La courbe occupe toute la hauteur (échelle propre à la plongée) ; la couleur du fond suit la règle de la colonne d'eau, donc la profondeur reste lisible. Elle porte un texte alternatif : « Profil, 27,6 m au plus profond ».

**`<LignePlongee>` : une plongée dans une liste.** Miniature ; site sur la première ligne (« Site à préciser » en texte tertiaire quand il manque, jamais un nom inventé) ; date et heure sur la seconde ; à droite, la profondeur maximale en gras puis la durée. Une plongée modifiée hors ligne remplace la date par ce qui attend d'être envoyé (« Notes modifiées, en attente d'envoi »), en `--od-attente`.

**`<LigneVoyage>` : un voyage replié.** Quatre miniatures réduites en grille 2 × 2, « Voyage du 2 février 2013 », puis « 4 plongées, de 21,8 à 28,7 m » ; un toucher déplie le voyage. Les voyages automatiques du cœur se nomment comme les autres ; leur identifiant change à chaque chargement et ne se conserve jamais.

**`<FiltreActif>` : la ligne de filtre actif.** Tant qu'un filtre est appliqué, une ligne en tête du Carnet, des Statistiques et de la carte le rappelle avec le nombre de plongées retenues (« Combinaison : dry suit, 12 plongées ») et un bouton pour l'enlever. Le filtre est le même dans les trois sections.

**`<EtatSynchro>` : l'état de synchronisation.** Une ligne sous le titre du Carnet, jamais une fenêtre : « Synchronisé avec le cloud Subsurface » (texte secondaire, coche), « Hors ligne : 2 modifications seront envoyées au retour du réseau » ou « Synchronisation arrêtée pour une plongée » (`--od-attente`, avec une icône). Elle n'interrompt le plongeur que s'il doit choisir (conflit, section 6).

Une réserve de gaz insuffisante dans le planificateur est une ligne de liste ordinaire dont la valeur est en `--od-alarme`, avec l'écart écrit en toutes lettres (« Il manque 18 bar pour remonter à deux »).

## 5. Écrans et données demandées au cœur

Chaque écran lit et écrit par la façade `libopendives` (via le plugin `OpenDivesCore`), jamais par les structures de Subsurface. Aujourd'hui elle sait : `init`, `log_exists`, `apply_log_prefs`, `import_file`, `list_dives`, `cloud_configure`, `set_ca_file`, `cloud_list_dives` et `cloud_branch_status` (lecture seule). La colonne de droite dit ce qu'il faut ajouter, dans l'ordre où les écrans seront construits.

| Écran | Contenu et actions | Données du cœur (à ajouter en gras) |
| --- | --- | --- |
| Premier lancement | Trois choix expliqués : compte existant, créer un compte, commencer sans compte | `cloud_configure` ; **`cloud_create_account`** et **`cloud_verify_pin`** (validation par PIN envoyé par courriel) |
| Nouveau compte, reprendre un carnet | divelogs.de (identifiants, jamais conservés), fichier, ou carnet vide | `import_file` ; le téléchargement depuis divelogs.de se fait côté app, puis `import_file` sur le fichier .dld reçu |
| Carnet | Liste par voyage, recherche, état de synchronisation, bouton « + » (télécharger, importer, noter à la main) | `list_dives` (ajouter la miniature : **`samples_summary`** par plongée, quelques dizaines de points) ; **`sync_status`** |
| Détail d'une plongée | Profil explorable, couches techniques, faits, compagnons, étiquettes, Planifier à partir de cette plongée | **`get_dive`** : échantillons, bouteilles, gaz, événements, plafond, ppO2, ordinateurs, compagnons, combinaison, notes |
| Modifier une plongée, saisie rapide | Champs de la plongée, compagnons, mode circuit ouvert ou recycleur, bouteilles ; Enregistrer | **`update_dive`** puis enregistrement git ; les commandes d'annulation de Subsurface dépendent de Qt, donc l'annulation est à refaire dans la façade |
| Téléchargement | Association la première fois, puis un geste ; progression ; échec expliqué | **`download_start`** avec un transport fourni par l'app (`dc_custom_open` de libdivecomputer branché sur le Bluetooth du système) ; liste des modèles reconnus |
| Sites | Carte hors ligne (PMTiles), liste, sites sans position, plongées sans site | **`list_sites`** (nom, position, nombre de plongées, profondeur max) |
| Statistiques | Page précompilée (totaux, par mode, combinaison, compagnon, ordinateur, année, site) ; Filtre libre | **`stats`** sur la sélection courante, d'après `statistics.cpp` |
| Filtre libre | Tous les critères, matériel compris ; filtres enregistrés | **`filter_apply`**, d'après `filterconstraint.cpp` et `fulltext.cpp`, déjà compilés ; **`list_filter_presets`** |
| Outils, calculateur de gaz | MOD, meilleur mélange | **`gas_mod`**, **`gas_best_mix`** (d'après `gas.cpp`) |
| Planificateur | Nouvelle plongée ou à partir du carnet ; plan, gaz, réserve, CNS et OTU | **`plan_dive`** (d'après `planner.cpp`, déjà essayé dans la preuve de concept) ; **`plan_from_dive`** pour reprendre gaz, bouteille, pression et SAC |
| Réglages | Compte, unités une par une, apparence, cartes hors ligne, ordinateurs | **`get_prefs`** / **`set_prefs`** pour les unités, enregistrées dans le carnet comme le fait Subsurface |

Toutes ces fonctions s'exécutent sur le fil unique du cœur et renvoient du JSON ; aucune ne bloque l'interface. Un appel long (synchronisation, téléchargement) envoie sa progression par événements du plugin.

## 6. États et messages

Chaque écran a cinq états à construire, en plus de l'état normal : chargement, vide, erreur, hors ligne et conflit. Ils sont dessinés sur téléphone dans les maquettes.

| État | Règle |
| --- | --- |
| Chargement | Les lignes gardent leur place (miniatures et textes grisés) ; jamais d'écran blanc ni de roue seule au centre |
| Vide | Un titre qui dit l'état (« Aucune plongée pour l'instant »), une phrase qui dit quoi faire, puis les actions possibles : associer un ordinateur, importer un fichier, télécharger depuis divelogs.de, noter à la main |
| Erreur | Ce qui s'est passé, ce qui n'a pas changé (« Aucune plongée n'a été modifiée »), ce qu'il faut vérifier, en liste numérotée, puis Réessayer ; jamais le texte brut d'une erreur du cœur |
| Hors ligne | Tout fonctionne ; `<EtatSynchro>` compte les modifications en attente et chaque plongée touchée le dit ; l'envoi part seul au retour du réseau |
| Conflit | Seulement quand Subsurface ne peut pas fusionner (« Remote storage and local data diverged ») : une feuille (iOS) ou un dialogue (Android) propose de garder la version de l'appareil ou celle du cloud, après comparaison ; rien n'est perdu avant le choix. **À valider** : ajout propre à OpenDives |

**Messages du cœur.** Ils sont traduits par la façade en codes, puis en phrases françaises par l'app. Certains messages ne s'affichent jamais : `origin lookup failed` pour un carnet local, par exemple, est normal en mode sans compte.

**Rédaction.**

- Les mots du plongeur : palier, plafond, SAC, MOD, gaz, ordinateur de plongée, compagnon.
- Un bouton dit ce qu'il fait (« Télécharger les plongées »), et le résultat reprend le même mot (« 3 plongées téléchargées »).
- Un choix dit sa conséquence sous son libellé, comme au premier lancement.
- Pas de point d'exclamation, pas de « Oups », pas de majuscules d'insistance ; vouvoiement partout.
- Une donnée absente s'affiche comme absente (« Site à préciser »), jamais comme une valeur inventée.

## 7. Interdits et vérifications avant de livrer un écran

**Jamais dans OpenDives :**

- assistant conversationnel, bouton « suggérer », résumé généré ;
- icônes d'étincelles ou emoji, dégradés décoratifs (le seul dégradé est la colonne d'eau, qui code la profondeur), cartes identiques à grosses ombres, tuiles de chiffres sur chaque écran ;
- étiquettes en majuscules au-dessus des titres, mot isolé mis en couleur dans un titre, chaînes « A · B · C », flèche « → » ajoutée aux boutons ;
- animations d'entrée : le mouvement ne répond qu'à un geste ;
- texte de remplissage ou données inventées, y compris dans les captures et les tests.

**À vérifier sur un vrai téléphone, pour chaque écran :**

- [ ] Rendu iOS et rendu MD3, en clair et en sombre
- [ ] Plus grande taille de texte du système : rien n'est coupé ni superposé
- [ ] VoiceOver et TalkBack : chaque bouton a un nom, chaque profil et miniature un texte alternatif, l'ordre de lecture suit l'écran
- [ ] Contrastes conformes à la section 1, et lisibilité en plein soleil
- [ ] Mouvements réduits respectés
- [ ] Unités mélangées (pieds et °C, par exemple) et format français des nombres
- [ ] Les cinq états de la section 6
- [ ] Un carnet réel lu depuis le cloud (le tien), et le carnet d'exemple de Subsurface

**Points ouverts à trancher :** couleurs Alarme et Attente en sombre ; distinction de l'oxygène et du sapin dans le profil ; choix de version en cas de conflit.
