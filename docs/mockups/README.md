# Mock-ups (source)

Copies of every board of the design canvas on claude.ai ([online](https://claude.ai/artifact/Jpuj8pGER3xz8n383JvYep), private), for the coding agent, refreshed on 6 November 2026 (latest: account buttons, conditions, Sites, trip). They are the HTML source of the boards: read them for structure, texts, sizes and colours. They need the canvas runtime to render, so they do not display correctly when opened alone. UI texts are in French, the reference language.

When a mock-up and `docs/ui-specification.md` disagree, the specification wins. Some older boards predate later decisions (for example, the bottom bar was replaced by the side menu on phones, and the full dive detail is `detail3-*`); follow the specification and the tasks in `docs/agent-inbox.md`.

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
| `android-stats.dc.html` | Téléphone Android, Statistiques précompilées |
| `android-accueil.dc.html` | Téléphone Android, Premier lancement |
| `android-sites.dc.html` | Téléphone Android, Sites (carte hors ligne) |
| `android-outils.dc.html` | Téléphone Android, Outils et calculateur de gaz |
| `android-planificateur.dc.html` | Téléphone Android, Planificateur (résultat réel du cœur Subsurface) |
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
| `reglages-vitesse-android.dc.html` | Réglages, vitesses · Android |
| `reglages-duree-android.dc.html` | Réglages, durée · Android |
| `reglages-coordonnees-android.dc.html` | Réglages, coordonnées GPS · Android |
| `logo-hublot.dc.html` | Logo · Hublot (retenu) |
| `stats-annee-android.dc.html` | Statistiques, une année · Android |
| `stats-filtre-android.dc.html` | Statistiques, résultat filtré · Android |
| `stats-nouvelle-android.dc.html` | Nouvelle statistique · Android |
| `ios-stats-annee.dc.html` | Statistiques, une année · iPhone |
| `ios-stats-nouvelle.dc.html` | Nouvelle statistique · iPhone |
| `outils-desaturation-android.dc.html` | Désaturation · Android |
