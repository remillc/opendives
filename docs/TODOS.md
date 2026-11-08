# To-dos

Christian's running list of things to do. Kept short on purpose: an item that is done is deleted, not ticked.

Rules (agreed between the design agent and the code agent, see `docs/agent-inbox.md`, task 2026-11-07-29):
- Items are numbered #1, #2, #3… in the order they are added. Numbers are never reused or changed: the next item takes the highest number ever used plus one (kept in "Next number" below), even after items are deleted.
- **Adding:** when Christian writes "todo: …" to an agent, that agent adds the item at the end, in his words, and commits. Neither agent adds items on its own initiative.
- **Removing:** the agent that finishes an item deletes it in the same commit as the work. An agent that finds an item already done or no longer wanted asks Christian before deleting it.
- **Design or code:** a to-do about the mock-ups or the specification is for the design agent; it then sends the code agent a task in `docs/agent-inbox.md` and deletes the to-do once the task is sent. Any other to-do is for the code agent.
- **Tag:** every item starts with `[design]` or `[code]` right after its number, set by the agent that adds it (`#4 [design] …`). `[design]` = mock-ups, visuals, screen texts, specification; `[code]` = everything else. When unsure, the agent asks Christian. The tag says who handles the item and lets Christian list one kind only.
- No other content in this file: no history, no checked boxes, no notes from agents.

Next number: 15

## List

- #1 [code] ajouter de l'analytics dans l'app. Penser à corriger privacy
- #3 [code] urls U1 à U7 (non pour U8, U9 et U10) : U1 /plan/42 → /dives/42/plan ; U2 /plan/new → /plan ; U3 /plan/setup → /settings/planner ; U4 /statistics/year/2014 → /statistics/years/2014 ; U5 /filter/depth → /filter/criteria/depth ; U6 /download/failed → /download-failed ; U7 /add/download (iPhone) → /download ; et (ex-#7) Mettre /plan sous /tools
- #5 [design] Dans les mêmes réglages, pointer vers la vue déco dans les préférences
- #6 [design] /plan/new: refaire le visuel
- #8 [design] /tools/desaturation: beaucoup trop de texte. Texte pour me protéger.
- #10 [design] Compte: Compte subsurface vérifié: ?
- #11 [code] Plus tard (après la v1) : synchroniser aussi avec un dépôt git choisi par l’utilisateur (GitHub ou autre), en HTTPS, en plus du cloud Subsurface
- #13 [design] réglages, après unités, ajouter choix du type d'eau. Les outils doivent utiliser cette valeur par défaut
- #14 [design] Le bouton synchroniser maintenant dans le menu mobile devrait être centré horizontallement dans le menu
