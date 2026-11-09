#!/bin/bash
# Test 1 of docs/editing-and-sync-plan.md: local edit round trip on the sample
# logs, without network.
#
# For each sample:
#   1. sample -> git A; then A is loaded as the app loads a log (list_dives,
#      hence process_loaded_dives and its automatic trips, as Subsurface
#      does) and saved into a fresh B: B is the baseline. Saving B the same
#      way into a fresh B2 must give the same tree.
#   2. For each field (notes, suit, rating, visibility, buddies, diveguide,
#      tags), on a copy of B: edit the first dive, save, reload (checked by
#      edit-roundtrip), then
#        - exactly one file changed, and it is a dive's "Dive" file
#          ("Dive-<number>" for a numbered dive);
#        - one commit was added, whose message contains the command text.
#   3. For each field, on a copy of B: edit, save, undo, save: the tree is
#      the original one again, and the last message has the "(undo)" text.
#   4. On a copy of B with trips: split, remove a dive, ungroup, merge, edit
#      the location, add a dive; each saved, undone and saved: the tree is
#      the original one again.
#   5. On a copy of B: edit, then save into an unrelated repository: refused
#      with SAVE_REPLACEMENT, and that repository is unchanged.
#   6. On copies of B: a dive logged by hand and a file imported ($IMPORT,
#      by default TestDiveDivelogsDE.xml next to the first sample), each
#      undone; filter presets created, edited, deleted, undone: the tree is
#      the original one again. A sync conflict on the notes, after a merge
#      made as Subsurface's, resolved keeping each side in turn. On
#      SampleDivesV2: an edit synced to a remote (git daemon) then undone
#      and synced: the undo history survives the sync.
#
# usage: run-edit-roundtrip.sh <edit-roundtrip> <roundtrip> <workdir> <sample>...

ED=$1; RT=$2; W=$3; shift 3
IMPORT=${IMPORT:-$(cd "$(dirname "$1")" && pwd)/TestDiveDivelogsDE.xml}
FIELDS="notes suit rating visibility wavesize current surge chill buddies diveguide tags airtemp watertemp salinity atmpress divemode invalid weights cylinders"

tree() { git -C "$1" rev-parse 'main^{tree}'; }
tip() { git -C "$1" rev-parse main; }
count() { git -C "$1" rev-list --count main; }
newrepo() { rm -rf "$1"; git init -q -b main "$1"; }
value() { grep "^$1=" "$2" | head -1 | cut -d= -f2-; }

# An unrelated repository: its own history, a non-empty tree.
U0="$W/unrelated-template"
newrepo "$U0"
echo "not a dive log" > "$U0/README"
git -C "$U0" add README
git -C "$U0" -c user.name=test -c user.email=test@example.invalid commit -q -m "unrelated"

# One sample; prints its PASS, FAIL or SKIP line. The samples run in parallel.
run_one() {
  s=$1
  n=$(basename "$s"); d="$W/$n"; rm -rf "$d"; mkdir -p "$d"
  why=""
  newrepo "$d/A"; newrepo "$d/B"; newrepo "$d/B2"
  "$RT" "$s" "$d/A[main]" 2>"$d/log-import" || why="import"
  if [ -z "$why" ]; then
    "$ED" baseline "$d/A[main]" "$d/B[main]" >"$d/baseline.out" 2>"$d/log-baseline"; rc=$?
    [ $rc = 2 ] && why="no dive"
    [ $rc = 1 ] && why="baseline: $(value error "$d/baseline.out")"
  fi
  [ -z "$why" ] && { "$ED" baseline "$d/B[main]" "$d/B2[main]" >"$d/baseline2.out" 2>>"$d/log-baseline" || why="baseline 2"; }
  [ -z "$why" ] && [ "$(tree "$d/B")" != "$(tree "$d/B2")" ] && why="baseline not stable: $(echo $(git -C "$d/B2" diff --name-only "$(tree "$d/B")" 'main^{tree}'))"
  if [ "$why" = "no dive" ]; then
    printf 'SKIP %-42s no dive to edit\n' "$n"; return
  fi
  if [ -n "$why" ]; then
    printf 'FAIL %-42s %s\n' "$n" "$why"; return
  fi
  T0=$(tree "$d/B"); C0=$(count "$d/B")

  for f in $FIELDS; do
    [ -n "$why" ] && break
    # Edit, save, reload.
    E="$d/edit-$f"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" edit "$E[main]" "$f" >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc = 2 ]; then why="no dive"; break; fi
    [ $rc != 0 ] && { why="$f: $(value error "$E.out")"; break; }
    changed=$(git -C "$E" diff --name-only "$T0" 'main^{tree}')
    # The dive mode belongs to the dive computer: its "Divecomputer" file.
    if [ "$(echo "$changed" | grep -c .)" != 1 ] || ! basename "$changed" | grep -qE '^Dive(computer)?(-[0-9]+)?$'; then
      why="$f: files changed: $(echo $changed)"; break
    fi
    [ "$(count "$E")" = $((C0+1)) ] || { why="$f: $(($(count "$E")-C0)) commits added"; break; }
    text=$(value text "$E.out")
    git -C "$E" log -1 --format=%B | grep -qF "$text" || { why="$f: commit message lacks '$text'"; break; }
    echo "$f	$changed	$text" >> "$d/edits"

    # Edit, save, undo, save.
    E="$d/undo-$f"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" undo "$E[main]" "$f" >"$E.out" 2>"$E.err" || { why="$f undo: $(value error "$E.out")"; break; }
    [ "$(tree "$E")" = "$T0" ] || { why="$f undo: tree differs from the original: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"; break; }
    [ "$(count "$E")" = $((C0+2)) ] || { why="$f undo: $(($(count "$E")-C0)) commits added"; break; }
    utext=$(value undo_text "$E.out")
    git -C "$E" log -1 --format=%B | grep -qF "$utext" || { why="$f undo: commit message lacks '$utext'"; break; }
  done

  if [ -z "$why" ]; then
    # Trip operations (split, remove, ungroup, merge, location, add), each
    # undone: the tree is the original one again. Logs without trips skip it.
    E="$d/trips"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" trips "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc = 1 ]; then why="trips: $(value error "$E.out")"
    elif [ $rc = 0 ] && [ "$(tree "$E")" != "$T0" ] &&
         git -C "$E" diff "$T0" 'main^{tree}' | grep '^[-+]' | grep -v '^+++' | grep -v '^---' | grep -qvx '+notrip'; then
      # Only "notrip" may remain: Subsurface's RemoveDivesFromTrip sets it and
      # deliberately does not reset it on undo.
      why="trips: tree differs after undo: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    elif [ $rc = 0 ]; then echo "$(grep -c '^step=' "$E.out") trip steps" > "$d/trips.ok"; fi
  fi

  if [ -z "$why" ]; then
    # Site changes (edit fields, a dive's site, merge, create and delete),
    # each undone: the tree is the original one again.
    E="$d/sites"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" sites "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc = 1 ]; then why="sites: $(value error "$E.out")"
    elif [ $rc = 0 ] && [ "$(tree "$E")" != "$T0" ]; then why="sites: tree differs after undo: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    elif [ $rc = 0 ]; then echo ok > "$d/sites.ok"; fi
  fi

  if [ -z "$why" ]; then
    # A dive logged by hand, then a file imported, each undone: the tree is
    # the original one again.
    E="$d/divelist"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" divelist "$E[main]" "$IMPORT" >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc != 0 ]; then why="divelist: $(value error "$E.out")"
    elif [ "$(tree "$E")" != "$T0" ]; then why="divelist: tree differs after undo: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    fi
  fi

  if [ -z "$why" ]; then
    # Filter presets created, edited, deleted, each undone, and read back
    # from git: the tree is the original one again.
    E="$d/presets"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" presets "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc != 0 ]; then why="presets: $(value error "$E.out")"
    elif [ "$(tree "$E")" != "$T0" ]; then why="presets: tree differs: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    fi
  fi

  if [ -z "$why" ]; then
    # A merged computer, read back from the log: its dives have the other's identity.
    E="$d/computersreload"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" computersreload "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    [ $rc = 1 ] && why="computersreload: $(value error "$E.out")"
  fi

  if [ -z "$why" ]; then
    # Dive computers of the logbook merged and renamed, then undone: the tree
    # is the original one again.
    E="$d/computers"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" computers "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc = 1 ]; then why="computers: $(value error "$E.out")"
    elif [ $rc = 0 ] && [ "$(tree "$E")" != "$T0" ]; then why="computers: tree differs after undo: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    fi
  fi

  if [ -z "$why" ]; then
    # The second computer of a dive made the main one, then undone: the tree
    # is the original one again. Logs without such a dive skip it.
    E="$d/maindc"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" maindc "$E[main]" - >"$E.out" 2>"$E.err"; rc=$?
    if [ $rc = 1 ]; then why="maindc: $(value error "$E.out")"
    elif [ $rc = 0 ] && [ "$(tree "$E")" != "$T0" ]; then why="maindc: tree differs after undo: $(echo $(git -C "$E" diff --name-only "$T0" 'main^{tree}'))"
    fi
  fi

  if [ -z "$why" ] && [ "$n" = SampleDivesV2.ssrf ]; then
    # Undo after a sync: the log has a remote (a bare copy of B served by
    # git daemon); edit, save, sync, undo, save, sync: the remote's tree is
    # the original one, and the sync never read the log again.
    rm -rf "$d/remote.git" "$d/home"; git clone -q --bare "$d/B" "$d/remote.git"; mkdir -p "$d/home"
    E="$d/syncundo"
    HOME="$d/home" "$ED" syncundo "git://127.0.0.1:$PORT/$n/remote.git[main]" - >"$E.out" 2>"$E.err" ||
      why="syncundo: $(value error "$E.out")"
    [ -z "$why" ] && [ "$(git -C "$d/remote.git" rev-parse 'main^{tree}')" != "$T0" ] && why="syncundo: remote tree differs"
    [ -z "$why" ] && [ "$(git -C "$d/remote.git" rev-list --count main)" != $((C0+2)) ] && why="syncundo: $(($(git -C "$d/remote.git" rev-list --count main)-C0)) commits pushed"
  fi

  for k in device cloud; do
    [ -n "$why" ] && break
    # A sync conflict on the notes of the first dive, resolved by keeping one side.
    E="$d/conflict-$k"; rm -rf "$E"; cp -r "$d/B" "$E"
    "$ED" conflict "$E[main]" $k >"$E.out" 2>"$E.err" || why="conflict $k: $(value error "$E.out")"
  done

  if [ -z "$why" ]; then
    # Save into an unrelated repository: refused, nothing written.
    E="$d/refuse"; rm -rf "$E" "$d/unrelated"; cp -r "$d/B" "$E"; cp -r "$U0" "$d/unrelated"
    H0=$(tip "$d/unrelated")
    "$ED" refuse "$E[main]" "$d/unrelated[main]" >"$E.out" 2>"$E.err" || why="refuse: $(value save_as "$E.out")"
    [ -z "$why" ] && [ "$(tip "$d/unrelated")" != "$H0" ] && why="refuse: the unrelated repository changed"
    [ -z "$why" ] && [ -n "$(git -C "$d/unrelated" status --porcelain)" ] && why="refuse: files written in the unrelated repository"
  fi

  if [ "$why" = "no dive" ]; then
    printf 'SKIP %-42s no dive to edit\n' "$n"
  elif [ -z "$why" ]; then
    printf 'PASS %-42s %s dives\n' "$n" "$(value dives "$d/edit-notes.out")"
  else
    printf 'FAIL %-42s %s\n' "$n" "$why"
  fi
}

# One sample per processor (JOBS to change it). Keep the work directory on a
# Linux file system (under WSL, not /mnt/...): git is much slower there.
# A git daemon serves the work directory, for the undo-after-sync check.
PORT=${PORT:-19418}
git daemon --export-all --enable=receive-pack --base-path="$W" --listen=127.0.0.1 --port=$PORT --reuseaddr \
  --pid-file="$W/daemon.pid" --detach "$W"
trap 'kill $(cat "$W/daemon.pid") 2>/dev/null' EXIT

export ED RT W FIELDS U0 IMPORT PORT
export -f run_one tree tip count newrepo value
printf '%s\0' "$@" | xargs -0 -P "${JOBS:-$(nproc)}" -I{} bash -c 'run_one "$1"' _ {} > "$W/results"
sort -k2 "$W/results"
pass=$(grep -c '^PASS' "$W/results"); fail=$(grep -c '^FAIL' "$W/results"); skip=$(grep -c '^SKIP' "$W/results")
echo "passed: $pass  failed: $fail  skipped: $skip"
[ "$fail" = 0 ]
