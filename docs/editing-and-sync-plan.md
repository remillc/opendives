# Editing a dive and sending it to the cloud: plan

2026-11-06 · Christian Rémillard

This plan is for the coding agent. It covers the first write path of OpenDives: change a dive, save it in the local git repository, and synchronise it with the Subsurface cloud. It is the riskiest step so far: a mistake can damage a real logbook that Subsurface desktop and Subsurface-mobile also use. Everything below is ordered so that nothing touches Christian's real account before every safety gate has passed.

## 1. Scope of the first increment

- Edit one existing dive at a time, with these fields only: notes, buddies, dive guide, tags, suit, rating (0 to 5), visibility (0 to 5).
- Each edit is one undoable step; Undo and Redo work for the current session.
- Save to the local git repository, then synchronise with the cloud (fetch, merge, push), as Subsurface-mobile does.
- Show the state in `<SyncStatus>`: synced, changes waiting to be sent, synchronisation stopped (see `docs/ui-specification.md`, sections 4 and 6).

Not in this increment: adding or deleting a dive, dates and times, depth and duration, cylinders and weights, dive sites, trips, merging and splitting. They come later on the same foundations.

## 2. How Subsurface does it (references)

- **Mobile save flow:** `mobile-widgets/qmlmanager.cpp`, `saveChangesLocal()` and `saveChangesCloud()`.
  - Local save: refuse if the destination is not the log that was opened (`cloudDestinationIsSafe()`), set `git_local_only = true`, call `save_dives(existing_filename)`, then mark the log clean.
  - Cloud save: local save first, then reload with `git_local_only = false`, which runs `sync_with_remote()` and loads the merged result.
- **Save safety:** `classify_git_save()` in `core/git-access.h` returns `normal`, `replacement` or `error`. Only `normal` may proceed; `replacement` means the save would overwrite cloud data the in-memory log is not based on.
- **Commit message:** `core/save-git.cpp` writes "Changes made:" followed by `Command::changesMade()`, the texts of the undo commands since the last save. Our shim `core/compat/shadow/commands/command.h` replaces that header.
- **Editing a dive:** `commands/command_edit.cpp`, `EditDive::exchangeDives()`: copy the dive, change the copy, then swap the contents. Around the swap: `fulltext_unregister` / `fulltext_register`, unregister and re-register the dive with its dive site, `invalidate_cache()`, and re-sort dives and trips if the time changed. The command texts (for example "Edit notes", "Edit buddies") are in the `Edit*` classes of `commands/command_edit.h`.
- **Do not compile `commands/`:** it depends heavily on Qt (`QUndoCommand`, signals, about 110 Qt uses in `command_edit.cpp`). Port the logic into the facade instead, in standard C++, without modifying Subsurface.

## 3. Facade API to add (`libopendives`)

All functions run on the core's thread and return JSON or an error code, like the existing ones.

| Function | Role |
| --- | --- |
| `edit_dive(id, changes_json, result_json, error)` | Applies a set of field changes to one dive as a single undoable step. `changes_json` names the fields: `notes`, `buddies` (list), `diveguide` (list), `tags` (list), `suit`, `rating`, `visibility`. Returns the updated dive, as `get_dive` does. |
| `undo(result_json, error)`, `redo(result_json, error)`, `can_undo()`, `can_redo()` | Undo stack kept by the facade: for each step, the previous copy of the dive and the command text. |
| `has_unsaved_changes()` | True when the in-memory log differs from the last local save. |
| `save_local(error)` | `classify_git_save()` must return `normal`, otherwise refuse with `SAVE_REPLACEMENT` or `SAVE_ERROR`. Then `git_local_only = true`, `save_dives(url)`, clear the list of change texts. |
| `sync(status_json, error)` | Local save if needed, then the same reload-with-sync path as Subsurface-mobile, then `apply_log_prefs()` (mandatory after every load). Returns `up_to_date`, `pushed`, `merged`, `offline` or `stopped`, with the number of local commits still waiting. |
| `pending_changes(json)` | Local commits not yet on the server, with their messages, for `<SyncStatus>` and the dive rows. |

**Rules.**

- An edit copies the dive, applies the changes to the copy, then swaps the contents as `EditDive::exchangeDives()` does, with the same registration and cache steps.
- Command texts are the same English strings as Subsurface's, so commit messages look the same as those written by Subsurface desktop and mobile. `changesMade()` in the shim returns these texts, one per line, since the last save.
- Unknown data must survive: only the fields in the request change; everything else in the dive is kept as loaded.
- Before the first write of a session, call `cloud_branch_status()` again: Subsurface's `git-access.cpp:52` bug treats almost any clone failure as "branch missing" and creates an empty commit (see `poc/README.md`). Never write if the branch status is unknown.
- If the format version in `00-Subsurface` is newer than the one we know, the log stays read only: `edit_dive` returns `FORMAT_NEWER`.

## 4. Write lock until the gates pass

- Writing to a cloud account is disabled by default. It is enabled only when the account email matches the one in the test credentials file (`OPENDIVES_CLOUD_TEST_EMAIL`, in a file outside the repository, like `cloud-dev.env`), or when Christian turns on a developer setting after step 6 below.
- Local-only logs (no account) can be edited and saved from the start, since they cannot affect the cloud.
- The credentials files are never committed and never printed.

## 5. Tests, in order (each one must pass before the next)

1. **Local edit round trip** (Linux, CI, no network), on the 98 sample logs in `third_party/subsurface/dives/` loaded into git repositories:
   - for each field, edit one dive, save, reload: the field has the new value;
   - the git trees before and after differ only in that dive's `Dive` file (and the commit);
   - undo then save gives a tree identical to the original;
   - the commit message contains the expected command text;
   - `classify_git_save()` refusal: saving the log into an unrelated repository returns `SAVE_REPLACEMENT` and writes nothing.
2. **Local log without an account:** create, edit, save, reopen.
3. **Test cloud account** (a separate Subsurface account that Christian creates; it needs the PIN sent by email), with a script `tests/run-cloud-write-test.sh` that only accepts the test email:
   - clone, edit one dive, sync; clone again into a fresh folder: the change is there, and the server head moved by exactly one commit;
   - two clones edit two different dives, both sync: the second sync merges, both changes are on the server;
   - two clones edit the same field of the same dive: record what Subsurface's merge keeps, and check that nothing else is lost;
   - offline: edit and save with the network cut, then sync when it is back;
   - after each scenario, Subsurface desktop opens the test account without error (manual check by Christian, once per scenario).
4. **On the phone, test account only:** edit from the app, kill the app before syncing, reopen: the change is still there and is sent.

## 6. Moving to Christian's real account

Only after all the tests above pass, and only with Christian's explicit go-ahead:

1. Back up the real account: `git clone --mirror` of the cloud branch into a folder outside the repository.
2. Turn on writing with the developer setting.
3. Make one small edit (a note), sync, then check it in Subsurface desktop.

## 7. Interface

- The editing screen follows the mock-ups "Modifier une plongée" (`ios-edition`, `android-edition`), limited to the fields of section 1 for now; the others stay visible but read only.
- Save applies the edit, saves locally and starts a sync in the background; the screen closes at once. Undo is offered in a snackbar (Android) or a banner (iOS) for a few seconds.
- `<SyncStatus>` and the dive rows show pending changes in `--od-pending`, with the text of the change ("Notes edited, waiting to be sent").
- Errors are shown with the codes above, translated; never the raw core message.

## 8. What to report after each step

The tests run and their result, the git commits created on the test account (hashes and messages), anything that differs from Subsurface's behaviour, and any change that would require touching Subsurface's code (it must not be done; propose a patch in `patches/` instead).
