# Mock-ups (source)

Copies of every board of the design canvas on claude.ai ([online](https://claude.ai/artifact/Jpuj8pGER3xz8n383JvYep), private), for the coding agent, refreshed on 6 November 2026 (latest: account buttons, conditions, Sites, trip). They are the HTML source of the boards: read them for structure, texts, sizes and colours. They need the canvas runtime to render, so they do not display correctly when opened alone. UI texts are in French, the reference language.

When a mock-up disagrees with `docs/system-design.md` or `docs/ui-specification.md`, those documents win. Some older boards predate later decisions (for example, the bottom bar was replaced by the side menu on phones, and the full dive detail is `detail3-*`); follow the specification and the tasks in `docs/agent-inbox.md`.

| File | Board |
| --- | --- |
| `Main.dc.html` | iPhone, Carnet |
| `ios-telechargement.dc.html` | iPhone, Téléchargement en cours |
| `ios-saisie.dc.html` | iPhone, Saisie rapide sur le bateau |
| `ios-stats-tableau.dc.html` | Statistiques · iPhone |
| `ios-stats.dc.html` | Statistiques, résultat filtré · iPhone |
| `ios-filtre.dc.html` | iPhone, Filtre libre |
| `ios-accueil.dc.html` | iPhone, Premier lancement |
| `ios-sites.dc.html` | iPhone, Sites (carte hors ligne) |
| `ios-outils.dc.html` | iPhone, Outils et calculateur de gaz |
| `ios-planificateur.dc.html` | iPhone, Planificateur (résultat réel du cœur Subsurface) |
| `ios-edition.dc.html` | iPhone, Modifier une plongée recycleur |
| `ios-reglages.dc.html` | iPhone, Réglages |
| `ios-etat-vide.dc.html` | iPhone, État : carnet vide |
| `ios-etat-echec.dc.html` | iPhone, État : téléchargement échoué |
| `ios-etat-horsligne.dc.html` | iPhone, État : hors ligne, modifications en attente |
| `ios-etat-conflit.dc.html` | iPhone, État : conflit de synchronisation |
| `ios-compte-import.dc.html` | iPhone, Nouveau compte : reprendre un carnet (divelogs.de) |
| `tablette-carnet.dc.html` | iPad, Carnet, liste et détail |
| `tablette-stats.dc.html` | iPad, Statistiques précompilées |
| `tablette-sites.dc.html` | iPad, Sites et carte |
| `tablette-outils.dc.html` | iPad, Outils : planificateur et calculateur de gaz |
| `tablette-edition.dc.html` | iPad, Modifier une plongée (feuille) |
| `tablette-reglages.dc.html` | iPad, Réglages |
| `android-carnet.dc.html` | Téléphone Android, Carnet |
| `android-carnet-menu.dc.html` | Téléphone Android, Carnet, menu ⋮ ouvert (Filtrer, Renuméroter les plongées) |
| `android-stats.dc.html` | Téléphone Android, Statistiques précompilées |
| `android-stats-plongees.dc.html` | Téléphone Android, Statistiques, plongées d’une ligne |
| `android-accueil.dc.html` | Téléphone Android, Premier lancement (remplacée par android-accueil-c, retirée du canevas) |
| `android-accueil-c.dc.html` | Téléphone Android, Premier lancement (retenue) |
| `android-sites.dc.html` | Téléphone Android, Sites (carte hors ligne) |
| `android-outils.dc.html` | Téléphone Android, Outils et calculateur de gaz |
| `android-planificateur.dc.html` | Téléphone Android, Planificateur depuis une plongée du carnet |
| `android-planificateur-menu.dc.html` | Téléphone Android, Planificateur, menu ⋮ ouvert (Partager le plan, Réglages) |
| `android-planificateur-nouveau.dc.html` | Téléphone Android, Planificateur d'une nouvelle plongée (niveaux, gaz, conditions) |
| `android-plans.dc.html` | Téléphone Android, Plongées planifiées (liste) |
| `android-plans-menu.dc.html` | Téléphone Android, Plongées planifiées, menu d'un plan |
| `android-plans-vide.dc.html` | Téléphone Android, Plongées planifiées, liste vide |
| `reglages-planificateur-android.dc.html` | Téléphone Android, Réglages du planificateur (vitesses, paliers, gaz, réserve) |
| `android-edition.dc.html` | Téléphone Android, Modifier une plongée recycleur |
| `android-reglages.dc.html` | Téléphone Android, Réglages |
| `android-etat-vide.dc.html` | Téléphone Android, État : carnet vide |
| `android-etat-echec.dc.html` | Téléphone Android, État : téléchargement échoué |
| `android-etat-horsligne.dc.html` | Téléphone Android, État : hors ligne, modifications en attente |
| `android-etat-conflit.dc.html` | Téléphone Android, État : conflit de synchronisation |
| `android-compte-import.dc.html` | Téléphone Android, Nouveau compte : reprendre un carnet (divelogs.de) |
| `android-tablette-carnet.dc.html` | Tablette Android, Carnet, liste et détail |
| `android-tablette-stats.dc.html` | Tablette Android, Statistiques précompilées |
| `android-tablette-sites.dc.html` | Tablette Android, Sites et carte |
| `android-tablette-outils.dc.html` | Tablette Android, Outils : planificateur et calculateur de gaz |
| `android-tablette-edition.dc.html` | Tablette Android, Modifier une plongée |
| `android-tablette-reglages.dc.html` | Tablette Android, Réglages |
| `detail2-ios-menu.dc.html` | Détail, menu en haut à droite ouvert, iPhone |
| `detail2-android-menu.dc.html` | Détail, menu en haut à droite ouvert, Android |
| `partage-android.dc.html` | Téléphone Android, Partager : choix entre « Fiche PDF » et « Résumé et image » |
| `partage-pdf-fiche.dc.html` | Fiche PDF d’une plongée, format lettre |
| `detail3-ios.dc.html` | Détail complet, iPhone |
| `detail3-android.dc.html` | Détail complet, Android |
| `detail3-ios-sombre.dc.html` | Détail complet, iPhone, sombre |
| `detail3-android-sombre.dc.html` | Détail complet, Android, sombre |
| `appbar-tiroir-android.dc.html` | Barre du haut, menu latéral, Android |
| `appbar-tiroir-android-ouvert.dc.html` | Barre du haut, menu latéral, Android, ouvert |
| `appbar-tiroir-ios.dc.html` | Barre du haut, menu latéral, iPhone |
| `appbar-tiroir-ios-ouvert.dc.html` | Barre du haut, menu latéral, iPhone, ouvert |
| `compte-ios-connecte.dc.html` | Compte, iPhone, connecté |
| `compte-android-connecte.dc.html` | Compte, Android, connecté |
| `compte-ios-sans-compte.dc.html` | Compte, iPhone, sans compte |
| `compte-android-sans-compte.dc.html` | Compte, Android, sans compte |
| `appbar-tiroir-android-ouvert-manuel.dc.html` | Barre du haut, menu latéral, Android, ouvert, synchronisation manuelle |
| `compte-android-connecte-manuel.dc.html` | Compte, Android, synchronisation manuelle |
| `compte-android-deconnexion.dc.html` | Compte, Android, confirmation de déconnexion |
| `compte-android-suppression.dc.html` | Compte, Android, supprimer le compte |
| `compte-connexion-android.dc.html` | Se connecter · Android |
| `compte-connexion-encours-android.dc.html` | Se connecter, connexion en cours · Android |
| `compte-connexion-erreur-android.dc.html` | Se connecter, adresse ou mot de passe incorrect · Android |
| `compte-creation-android.dc.html` | Nouveau compte, étape 1 sur 2 · Android |
| `compte-code-android.dc.html` | Nouveau compte, code de confirmation · Android |
| `compte-code-erreur-android.dc.html` | Nouveau compte, code incorrect · Android |
| `compte-connexion-ios.dc.html` | Se connecter · iPhone |
| `compte-connexion-encours-ios.dc.html` | Se connecter, connexion en cours · iPhone |
| `compte-connexion-erreur-ios.dc.html` | Se connecter, adresse ou mot de passe incorrect · iPhone |
| `compte-creation-ios.dc.html` | Nouveau compte, étape 1 sur 2 · iPhone |
| `compte-code-ios.dc.html` | Nouveau compte, code de confirmation · iPhone |
| `compte-code-erreur-ios.dc.html` | Nouveau compte, code incorrect · iPhone |
| `compte-import-identifiants-android.dc.html` | Nouveau compte, étape 2, identifiants refusés · Android |
| `compte-import-identifiants-ios.dc.html` | Nouveau compte, étape 2, identifiants refusés · iPhone |
| `compte-import-encours-android.dc.html` | Nouveau compte, import en cours · Android |
| `compte-import-echec-android.dc.html` | Nouveau compte, import échoué · Android |
| `compte-import-encours-ios.dc.html` | Nouveau compte, import en cours · iPhone |
| `compte-import-echec-ios.dc.html` | Nouveau compte, import échoué · iPhone |
| `alarme-sombre-1.dc.html` | Couleurs alarme et en attente, sombre |
| `voyage-android.dc.html` | Voyage, Android |
| `sites-fiche-android.dc.html` | Sites, Android, fiche d'un site |
| `sites-edition-android.dc.html` | Sites, Android, nouveau site |
| `sites-sans-site-android.dc.html` | Sites, Android, plongées sans site |
| `sites-nettoyer-android.dc.html` | Sites, Android, nettoyer les sites |
| `reglages-choix-android.dc.html` | Réglages, choix d’une valeur · Android |
| `reglages-nombre-android.dc.html` | Réglages, choix d’un nombre · Android |
| `reglages-menu-android.dc.html` | Réglages, menu d’un ordinateur · Android |
| `reglages-bouteilles-android.dc.html` | Types de bouteilles · Android |
| `reglages-bouteille-choix-android.dc.html` | Téléphone Android, Réglages, choix de la bouteille par défaut |
| `reglages-secours-android.dc.html` | Téléphone Android, Réglages, bouteilles de secours (bailout) du recycleur |
| `reglages-bouteille-type-android.dc.html` | Téléphone Android, Nouveau type de bouteille |
| `reglages-bouteille-modifier-android.dc.html` | Téléphone Android, Modifier un type de bouteille |
| `reglages-vitesse-android.dc.html` | Réglages, vitesses · Android |
| `reglages-duree-android.dc.html` | Réglages, durée · Android |
| `reglages-coordonnees-android.dc.html` | Réglages, coordonnées GPS · Android |
| `logo-variante-trois.dc.html` | Logo · Trois vagues (retenu le 9 novembre 2026) |
| `palette-roles.dc.html` | Palette · rôles MD3 (retenue le 9 novembre 2026) |
| `logo-anneau-adaptatif.dc.html` | Logo · Hublot, ancien logo |
| `stats-annee-android.dc.html` | Statistiques, une année · Android |
| `stats-filtre-android.dc.html` | Statistiques, résultat filtré · Android |
| `stats-nouvelle-android.dc.html` | Nouvelle statistique · Android |
| `ios-stats-annee.dc.html` | Statistiques, une année · iPhone |
| `ios-stats-nouvelle.dc.html` | Nouvelle statistique · iPhone |
| `outils-desaturation-android.dc.html` | Désaturation · Android |
| `outils-desaturation-terminee-android.dc.html` | Désaturation, avion permis · Android |
| `sites-modifier-android.dc.html` | Modifier le site · Android |
| `police-source-android.dc.html` | Police du texte courant, Source Sans 3 (retenue) · Android |
| `outils-ead-mod-android.dc.html` | Outils, EAD et MOD · Android |
| `outils-meilleur-melange-android.dc.html` | Outils, meilleur mélange · Android |
| `outils-melangeur-nitrox-android.dc.html` | Outils, mélangeur de gaz, nitrox · Android |
| `outils-melangeur-android.dc.html` | Outils, mélangeur de gaz, trimix · Android |
| `apropos-android.dc.html` | À propos · Android |
| `apropos-bibliotheques-android.dc.html` | Téléphone Android, À propos › Bibliothèques libres (chaque ligne ouvre le site) |

Example values (decided on 8 November 2026): the mock-ups show depths in feet, pressures in psi and weights in pounds, volumes in cubic feet (cylinder sizes as gas capacity at the working pressure, SAC in cuft/min), with temperatures in °C, as with personalised units. Partial pressures (ppO₂, pN₂, pHe, setpoints) stay in bar, as in Subsurface. These are only examples: the app always follows the units chosen in Settings.
| `detail3-android-curseur.dc.html` | Téléphone Android, détail avec le profil touché : curseur et lecture du temps et de la profondeur |
| `carnet-selection-android.dc.html` | Téléphone Android, carnet en sélection multiple (dessiné d’après l’app) |
| `carnet-selection-menu-android.dc.html` | Téléphone Android, carnet en sélection multiple, menu ⋮ ouvert |
| `carnet-export-android.dc.html` | Téléphone Android, exporter les plongées cochées : choix du format |
| `compte-git-android.dc.html` | Téléphone Android, Compte en mode dépôt git (#11) |
| `git-config-android.dc.html` | Téléphone Android, Dépôt git : configuration, dépôt trouvé, branches lues |
| `git-config-erreur-android.dc.html` | Téléphone Android, Dépôt git : accès refusé |
| `git-config-adresse-android.dc.html` | Téléphone Android, Dépôt git : aucun dépôt à cette adresse |
