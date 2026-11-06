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
#   4. On a copy of B: edit, then save into an unrelated repository: refused
#      with SAVE_REPLACEMENT, and that repository is unchanged.
#
# usage: run-edit-roundtrip.sh <edit-roundtrip> <roundtrip> <workdir> <sample>...

ED=$1; RT=$2; W=$3; shift 3
FIELDS="notes suit rating visibility buddies diveguide tags"
pass=0; fail=0; skip=0
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

for s in "$@"; do
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
    skip=$((skip+1)); printf 'SKIP %-42s no dive to edit\n' "$n"; continue
  fi
  if [ -n "$why" ]; then
    fail=$((fail+1)); printf 'FAIL %-42s %s\n' "$n" "$why"; continue
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
    if [ "$(echo "$changed" | grep -c .)" != 1 ] || ! basename "$changed" | grep -qE '^Dive(-[0-9]+)?$'; then
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
    # Save into an unrelated repository: refused, nothing written.
    E="$d/refuse"; rm -rf "$E" "$d/unrelated"; cp -r "$d/B" "$E"; cp -r "$U0" "$d/unrelated"
    H0=$(tip "$d/unrelated")
    "$ED" refuse "$E[main]" "$d/unrelated[main]" >"$E.out" 2>"$E.err" || why="refuse: $(value save_as "$E.out")"
    [ -z "$why" ] && [ "$(tip "$d/unrelated")" != "$H0" ] && why="refuse: the unrelated repository changed"
    [ -z "$why" ] && [ -n "$(git -C "$d/unrelated" status --porcelain)" ] && why="refuse: files written in the unrelated repository"
  fi

  if [ "$why" = "no dive" ]; then
    skip=$((skip+1)); printf 'SKIP %-42s no dive to edit\n' "$n"
  elif [ -z "$why" ]; then
    pass=$((pass+1)); printf 'PASS %-42s %s dives\n' "$n" "$(value dives "$d/edit-notes.out")"
  else
    fail=$((fail+1)); printf 'FAIL %-42s %s\n' "$n" "$why"
  fi
done
echo "passed: $pass  failed: $fail  skipped: $skip"
[ $fail = 0 ]
