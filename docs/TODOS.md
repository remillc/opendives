# To-dos

Christian's running list of things to do. Kept short on purpose: an item that is done is deleted, not ticked.

Rules (agreed between the design agent and the code agent, see `docs/agent-inbox.md`, task 2026-11-07-29):
- Items are numbered #1, #2, #3… in the order they are added. Numbers are never reused or changed: the next item takes the highest number ever used plus one (kept in "Next number" below), even after items are deleted.
- **Adding:** when Christian writes "todo: …" to an agent, that agent adds the item at the end, in his words, and commits. Neither agent adds items on its own initiative.
- **Removing:** the agent that finishes an item deletes it in the same commit as the work. An agent that finds an item already done or no longer wanted asks Christian before deleting it.
- **Design or code:** a to-do about the mock-ups or the specification is for the design agent; it then sends the code agent a task in `docs/agent-inbox.md` and deletes the to-do once the task is sent. Any other to-do is for the code agent.
- **Tag:** every item starts with `[design]` or `[code]` right after its number, set by the agent that adds it (`#4 [design] …`). `[design]` = mock-ups, visuals, screen texts, specification; `[code]` = everything else. When unsure, the agent asks Christian. The tag says who handles the item and lets Christian list one kind only. A second tag `[hors compat. SS]` may follow it, before the title, when the item would break compatibility with Subsurface (data Subsurface cannot read or keep); such an item needs Christian's explicit go-ahead before any code.
- No other content in this file: no history, no checked boxes, no notes from agents.

Next number: 41

## List

- #1 [code] ajouter de l'analytics dans l'app. Penser à corriger privacy (en pause : voir docs/analytics-decision.md)
- #3 [code] urls U1 à U7 (non pour U8, U9 et U10) : U1 /plan/42 → /dives/42/plan ; U2 /plan/new → /plan ; U3 /plan/setup → /settings/planner ; U4 /statistics/year/2014 → /statistics/years/2014 ; U5 /filter/depth → /filter/criteria/depth ; U6 /download/failed → /download-failed ; U7 /add/download (iPhone) → /download ; et (ex-#7) Mettre /plan sous /tools
- #10 [design] Compte: Compte subsurface vérifié: ?
- #15 [code] supprimer une plongée: afficher un dialogue de confirmation puis un snackbar
- #17 [design] ajouter la possibilité d'une switch globale "plongée récréative" qui masque les paramètres avancés et ceux concernant le mode de plongée cc. Ce que SS nomme le mode loisir.
- #18 [design] uniformiser « e-mail » et « courriel » dans les textes français de l'app : tout en « courriel »
- #20 [design] ajouter la possibilité pour l'usager de noter l'app dans le store
- #21 [design] ajouter une vue carte des plongées
- #23 [design] idée : ajouter une section Explorer, une carte qui affiche les sites de plongée des environs
- #27 [design] Se débarrasser de tout workflow lié à l'état invalide d'une plongée : menus contextuels, recherche, paramétrage. S'assurer au préalable que cette feature n'est pas utilisée.
- #32 [code] tablette : sur une petite tablette en paysage, le dialogue de /welcome défile. On ne veut pas de défilement dans ce dialogue. Même bogue que l'ex-#31, que Claude VC a traité avec la tâche 2026-11-10-18 : à vérifier sur une petite tablette, puis supprimer.
- #33 [code] /statistics (tablette) : quand on ferme un groupe (chevron bas/haut), si la plongée affichée dans le panneau de droite appartient à ce groupe, réinitialiser le panneau et afficher la vue vide de départ.
- #34 [design] décider où annoncer les APK gratuits (page « Télécharger » du site `site/`, README et versions GitHub, F-Droid plus tard ; la fiche du store seulement après avoir relu ses règles). Pas dans l'app.
- #35 [design] indiquer quelque part (À propos, aide ou écran d'erreur ?) que pour les problèmes du cœur du carnet (lecture des ordinateurs de plongée, format des fichiers, calculs) on peut s'adresser au forum de Subsurface. Trouver une formulation pour l'utilisateur, sans parler de « fonctions core ».
- #36 [design] Idée : Modifier une plongée sur place (Material 3 Expressive) : la fiche reste affichée, ses champs deviennent modifiables et la barre d'outils flottante passe à « Annuler / Enregistrer », au lieu du dialogue plein écran actuel. À évaluer plus tard : la fiche et l'écran de modification ne groupent pas les champs de la même façon.
- #37 [design] [hors compat. SS] Signature manuscrite d'une plongée par un compagnon (buddy) ou le guide de palanquée, tracée au doigt sur l'écran. Le format de Subsurface n'a pas de champ pour une signature : décider où et comment la stocker sans casser un carnet lu par Subsurface (fichier à part dans le dépôt git, données ignorées par Subsurface, etc.).
- #38 [design] Redessiner la page d'une plongée en misant davantage sur les regroupements en sections qui résument les données présentes et offrent de cliquer pour ouvrir une vue des détails de cette section. La section concernant l'équipement en particulier.
- #39 [design] Sur Détail d'une plongée, remplacer les barres par des bouteilles de plongée.
- #40 [design] Améliorer les vues pour le workflow de download des données d'un ordinateur de plongée. Doit être plus jazzé. Ce n'est pas clair qu'il faille sélectionner l'ordinateur de plongée pour que le téléchargement démarre.
