# To-dos

Christian's running list of things to do. Kept short on purpose: an item that is done is deleted, not ticked.

Rules (agreed between the design agent and the code agent, see `docs/agent-inbox.md`, task 2026-11-07-29):
- Items are numbered #1, #2, #3… in the order they are added. Numbers are never reused or changed: the next item takes the highest number ever used plus one (kept in "Next number" below), even after items are deleted.
- **Adding:** when Christian writes "todo: …" to an agent, that agent adds the item at the end, in his words, and commits. Neither agent adds items on its own initiative.
- **Removing:** the agent that finishes an item deletes it in the same commit as the work. An agent that finds an item already done or no longer wanted asks Christian before deleting it.
- **Design or code:** a to-do about the mock-ups or the specification is for the design agent; it then sends the code agent a task in `docs/agent-inbox.md` and deletes the to-do once the task is sent. Any other to-do is for the code agent.
- No other content in this file: no history, no checked boxes, no notes from agents.

Next number: 3

## List

- #1 ajouter de l'analytics dans l'app. Penser à corriger privacy
- #2 la chorégraphie presser btn synchroniser maintenant -> indicateur de progression -> retour, fait des flickers. Il faudrait que les éléments qui restent en place ne bougent pas. revoir la chorégraphie
