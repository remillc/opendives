# Proof of concept: the Subsurface core without Qt

**Goal:** check that OpenDives can reuse Subsurface's business code as is, without changing a single line, to read and write the dive log in the Subsurface cloud git format.

**Result (5 November 2026):** the core builds and the round-trip test passes on 97 of Subsurface's 98 sample logs.

## What is built

- **Subsurface** at commit `258beb4` (4 November 2026). 72 files from `core/`, including `load-git`, `save-git`, `git-access`, `parse-xml`, `save-xml`, `filterconstraint` and `fulltext`. No modifications.
- **libdivecomputer**, Subsurface-NG version at commit `617ffd7`, the one Subsurface pins itself. Built as a static library, without USB or Bluetooth: transports will be provided by the Capacitor layer.
- **`core/compat/`**: everything OpenDives adds.
  - `qtshim/`: fake Qt headers (`QString`, `QDateTime`, `QRegularExpression`…) in standard C++. They cover only what the core uses. Internal storage is UTF-32, and only the "C" locale is supported.
  - `shadow/commands/command.h`: it replaces the header of the Qt undo stack, which `save-git.cpp` includes to write the commit message.
  - `qthelper_compat.cpp`: it rewrites the functions of `qthelper.cpp`, `string-format.cpp`, `metadata.cpp`, etc.
    - Those that affect data are ported faithfully: GPS coordinates and XSLT stylesheets.
    - The others are kept to a minimum.
  - `notifier_compat.cpp`: it provides the Qt selection notifier, with no effect here.
  - `gen/`: generated version headers.

## The test

`tests/run-roundtrip.sh` runs each sample log (`dives/*.xml`, `*.ssrf`) through the following steps:

1. Import of the log into a git repository A.
2. Copy of A into a new repository B. Differences between A and B are **listed**, without failing the test.
3. Copy of B into a new repository C. **Strict**: the git tree of C must be identical, byte for byte, to that of B.
4. B saved again on top of itself. **Strict**: the tree must not change.
5. Export of B and C to XML. **Strict**: the two files must be identical.

The differences in step 2 come from Subsurface's code, not from the POC:

- **`deviceid`**, in 23 logs. `load-git.cpp` (`parse_dc_deviceid`) reads this line as obsolete data and does not keep it.
- **`meandepth`**, in 18 logs, on the order of 1 to 2 mm. Loading from git recomputes the mean depth from the samples (`fixup_dc_duration`).

These two differences were found by reading Subsurface's code. They were not compared with the official Subsurface application, which was not built here.

**Only failure:** `TestDiveSeabearNewFormat.xml`. This file contains pairs of dives with the same number and the same start time. On every save, their order is reversed, so the git tree changes. No data is lost. This edge case comes from Subsurface's sorting; it should be watched, but it blocks nothing.

## Edit round trip (6 November 2026)

Test 1 of `docs/editing-and-sync-plan.md`, without network: `tests/run-edit-roundtrip.sh` with `build/poc/edit-roundtrip` (`tests/edit_roundtrip.cpp`), through the façade's `edit_dive`, `undo`, `save_local` and `save_as` (`core/libopendives/edit.cpp`).

- **Baseline:** each sample is imported, then loaded as the app loads a log (`list_dives`, hence `process_loaded_dives()`) and saved into a fresh repository. Subsurface desktop and mobile also call `process_loaded_dives()` after a load: with automatic grouping on, the first save writes the automatic trips as real trips (`00-Trip` files, dives moved into the trip folders). The baseline is taken after that, and must be stable on a second save.
- **Checks, for notes, suit, rating, visibility, buddies, dive guide and tags:** the first dive is edited, saved and reloaded with the new value; exactly one file changed, that dive's `Dive` (or `Dive-<number>`) file; one commit, whose message is "Changes made:" and the command text ("Edit notes [#2]"). Then edit, save, undo, save: the tree is the original one, and the message is "(undo) Edit notes [#2]". Finally, saving into an unrelated repository is refused with `SAVE_REPLACEMENT` and writes nothing.
- **Result:** 95 passed, 2 skipped (`Dive_2013-02-02-1614.xml` and `test24.xml` have no dive), 1 failure: `TestDiveSeabearNewFormat.xml`, the same pairs of identical dives whose order Subsurface reverses on every save (see above).

```sh
tests/run-edit-roundtrip.sh build/poc/edit-roundtrip build/poc/roundtrip ~/ert   third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

The work directory must be on a Linux file system (not `/mnt/*`), as for the cloud test.

## Reproduce

Linux or WSL is required. The required packages are listed at the top of `poc/build.sh`.

```sh
git submodule update --init --recursive
poc/build.sh                      # → build/poc/roundtrip  (≈ 1 min 30)
tests/run-roundtrip.sh build/poc/roundtrip build/rt third_party/subsurface/dives/*.xml third_party/subsurface/dives/*.ssrf
```

The repositories `A[main]`, `B[main]`, etc. are local git repositories: this test does not contact the cloud.

## Real cloud, read-only (5 November 2026)

**Goal:** read, with the Subsurface core, a real cloud log written by Subsurface, then rewrite it locally without sending anything to the server.

**Result:** on a development account with 1,353 dives, the log is cloned and loaded. The rewrite is identical, byte for byte, except for 2 dives (see below). The server did not change: its head is the same before and after.

**What was added:**

- **`core/compat/cloud_compat.cpp`:** Qt-free port of `canReachCloudServer()`.
  - Same "make-latte" request to the servers, with a 418 response expected.
  - Same server order and same effects on `prefs` and `git_local_only`.
  - `getCloudURL()` is added as well.
- **`platform_https.h`:** the HTTPS request is provided by the platform, with a certificate that must be validated.
  - `https_openssl.cpp`: the Linux version.
  - Android also uses `https_openssl.cpp`, with an authorities file provided by the app (see `app/README.md`).
- **Façade:**
  - `cloud_branch_status()` is a read-only probe, with libgit2's normal TLS validation.
  - `apply_log_prefs()` is the port of `QMLManager::consumeFinishedLoad()`.
- **`tests/cloud.cpp` and `tests/run-cloud-readonly.sh`:**
  - The test refuses to load if the branch does not exist on the server.
  - It only works on copies without an `origin` remote.
  - It checks that the server head has not changed.

**What we learned:**

- **Log settings:** the units and preferences of `00-Subsurface` are read into `git_prefs`, but `save-git` writes `prefs`. Subsurface-mobile copies them over after every load. Without this step, now in `apply_log_prefs()`, the first save would have replaced `units PERSONALIZE FEET CUFT PSI CELSIUS LBS MINUTES` with `units METRIC`. **The app must call `apply_log_prefs()` after every load.**
- **Simultaneous events:** two events at the same instant with the same name are considered equal (`divecomputer.cpp:337`). Since `add_event_to_dc()` inserts with `lower_bound`, their order is reversed on every load, and therefore on every save. Two dives of the account have two `gaschange` events at 0:10. Nothing is lost, but their file changes on every save, in Subsurface as in OpenDives. This finding comes from reading the code, without checking with the Subsurface application.
- **Subsurface bug, `git-access.cpp:52`:** `includes_string_caseinsensitive()` returns true as soon as the first characters **differ**. Almost any clone failure is then treated as "branch missing on the server". The core creates a repository with an empty commit, "Initial commit to create empty repo.", then attempts a sync.
  - If the branch exists on the server, there is no common ancestor: nothing is pushed, and the cache is set aside.
  - Hence the prior probe in OpenDives.
  - To be reported to Subsurface once there is a contact.
- **Certificates:** `certificate_check_cb()` accepts any X.509 certificate for the cloud servers. Subsurface relies on `canReachCloudServer()` having validated TLS just before. Our port does validate the certificate, but the git connection itself remains without validation, as in Subsurface.
- **WSL:** libgit2 cannot `mmap` on a Windows drive (`/mnt/c`, `/mnt/f`): "failed to mmap. Could not write data". The test's working directory must be on the WSL file system.

**Reproduce.** The credentials are in a file outside the repository, with `OPENDIVES_CLOUD_EMAIL=` and `OPENDIVES_CLOUD_PASSWORD=`. The password is never displayed.

```sh
tests/run-cloud-readonly.sh build/poc/cloud build/poc/roundtrip /mnt/c/Users/<you>/.opendives/cloud-dev.env ~/opendives-cloud-rt
```

## What remains outside the POC

- iOS (Xcode).
- Upload to the cloud, that is, saving a change and then syncing.
- Imports that still depend on Qt: Suunto JSON and the Seabear CSV header, left empty here.
- Translations: `trGettext` returns the English text.
