#!/bin/bash
# Test 3 of docs/editing-and-sync-plan.md: WRITES to the Subsurface cloud TEST
# account, through the façade. Refuses any other account.
#
#   a. clone, edit one dive, sync; a fresh clone sees the change; the server
#      head moved by exactly one commit
#   b. two clones at the same head edit two different dives (the second from
#      its local copy, without syncing first), both sync: the second merges,
#      both changes are on the server
#   c. two clones edit the notes of the same dive: record what the merge
#      keeps, and check that nothing else changed
#   d. offline (no network for the process): edit and save, then sync once
#      the network is back
#   then the notes of the dives used are put back, in one more sync.
# First, the façade's write lock is checked on the same account: with another
# test address set, save and sync are refused and the server does not move.
#
# Each clone is a separate $HOME (the core's cache is under $HOME/.subsurface).
# Credentials: <dev-env> (OPENDIVES_CLOUD_EMAIL, OPENDIVES_CLOUD_PASSWORD) and
# <test-env> (OPENDIVES_CLOUD_TEST_EMAIL); the password is never printed.
# usage: run-cloud-write-test.sh <cloud-write> <dev-env> <test-env> <workdir>
set -uo pipefail
CW=$(realpath "$1"); DEVF=$2; TESTF=$3; W=$4
set -a; source <(tr -d '\r' < "$DEVF"); source <(tr -d '\r' < "$TESTF"); set +a
lc() { tr '[:upper:]' '[:lower:]' <<< "$1"; }
[ -n "${OPENDIVES_CLOUD_TEST_EMAIL:-}" ] && [ "$(lc "$OPENDIVES_CLOUD_EMAIL")" = "$(lc "$OPENDIVES_CLOUD_TEST_EMAIL")" ] ||
  { echo "REFUSED: the account is not the test account"; exit 2; }
BR=$OPENDIVES_CLOUD_EMAIL
rm -rf "$W"; mkdir -p "$W"; W=$(realpath "$W")
H1=$W/clone1; H2=$W/clone2; H3=$W/fresh
mkdir -p "$H1" "$H2" "$W/lock"
cw() { local h=$1; shift; HOME=$h "$CW" "$@"; }
val() { sed -n "s/^$1=//p" | head -1; }
fail() { echo "FAILED: $*"; RESULT=1; }
RESULT=0
fresh() { rm -rf "$H3"; mkdir -p "$H3"; }
notes_json() { printf '{"notes":"%s"}' "$1" > "$W/$2.json"; }
cache() { HOME=$1 "$CW" numbers | val cache; }

S0=$(cw "$W" head | val head)
[ -n "$S0" ] || { echo "FAILED: probe"; exit 1; }
echo "server head at start: ${S0:0:7}"

# The façade's lock: with another test address, nothing may be written.
cw "$W/lock" lockcheck > "$W/lock.out" || { cat "$W/lock.out"; echo "FAILED: write lock"; exit 1; }
[ "$(cw "$W" head | val head)" = "$S0" ] || { echo "FAILED: the lock check moved the server head"; exit 1; }
echo "lock: save and sync refused (WRITE_LOCKED), server unchanged"

cw "$H1" numbers > "$W/numbers.out" || { cat "$W/numbers.out"; exit 1; }
read -r N1 N2 N3 N4 _ <<< "$(val numbers < "$W/numbers.out")"
echo "log: $(val dives < "$W/numbers.out") dives; dives used: $N1 $N2 $N3 $N4"
for n in $N1 $N2 $N3 $N4; do cw "$H1" get "$n" | val value > "$W/orig-$n.json"; done
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

# a. one edit, one sync, one commit
notes_json "OpenDives write test a $STAMP" a
cw "$H1" edit "$N1" "$W/a.json" sync > "$W/a.out"
echo "a: $(val text < "$W/a.out") -> $(val status < "$W/a.out")"
grep -q '"status":"pushed"' "$W/a.out" || fail "a: not pushed: $(cat "$W/a.out")"
S1=$(cw "$W" head | val head)
C1=$(cache "$H1")
[ "$(git -C "$C1" rev-list --count "$S0..$S1")" = 1 ] && [ "$(git -C "$C1" rev-parse "$S1^")" = "$S0" ] ||
  fail "a: the server head did not move by exactly one commit"
fresh; [ "$(cw "$H3" get "$N1" | val value)" = "$(cat "$W/a.json")" ] || fail "a: a fresh clone does not see the change"

# b. two clones, two dives
cw "$H2" numbers > /dev/null
notes_json "OpenDives write test b1 $STAMP" b1; notes_json "OpenDives write test b2 $STAMP" b2
cw "$H1" edit "$N2" "$W/b1.json" sync > "$W/b1.out"
cw "$H2" edit-cached "$N3" "$W/b2.json" sync > "$W/b2.out"
echo "b: clone 1 -> $(val status < "$W/b1.out"), clone 2 -> $(val status < "$W/b2.out")"
grep -q '"status":"merged"' "$W/b2.out" || fail "b: the second sync did not merge: $(cat "$W/b2.out")"
SB=$(cw "$W" head | val head)
fresh
[ "$(cw "$H3" get "$N2" | val value)" = "$(cat "$W/b1.json")" ] || fail "b: change of clone 1 missing"
[ "$(cw "$H3" get "$N3" | val value)" = "$(cat "$W/b2.json")" ] || fail "b: change of clone 2 missing"

# c. two clones, same field of the same dive
cw "$H1" numbers > /dev/null; cw "$H2" numbers > /dev/null
notes_json "OpenDives write test c1 $STAMP" c1; notes_json "OpenDives write test c2 $STAMP" c2
cw "$H1" edit-cached "$N4" "$W/c1.json" sync > "$W/c1.out"
cw "$H2" edit-cached "$N4" "$W/c2.json" sync > "$W/c2.out"
echo "c: clone 1 -> $(val status < "$W/c1.out"), clone 2 -> $(val status < "$W/c2.out")$(val error < "$W/c2.out")"
SC=$(cw "$W" head | val head)
fresh; KEPT=$(cw "$H3" get "$N4" | val value)
case "$KEPT" in
  "$(cat "$W/c1.json")") echo "c: the server keeps clone 1's notes (the first pushed)";;
  "$(cat "$W/c2.json")") echo "c: the server keeps clone 2's notes (the last synced)";;
  *) echo "c: the server keeps: $KEPT";;
esac
C3=$(cache "$H3")
OTHERS=$(git -C "$C3" diff --name-only "$SB" "$SC" | grep -v '/Dive-'"$N4"'$' | grep -v '^$' || true)
[ -z "$OTHERS" ] || fail "c: other files changed: $(echo $OTHERS)"
echo "c: files changed by the two edits: $(echo $(git -C "$C3" diff --name-only "$SB" "$SC"))"

# d. offline, then back online
notes_json "OpenDives write test d $STAMP" d
cw "$H1" numbers > /dev/null
HOME=$H1 unshare -rn "$CW" edit-cached "$N1" "$W/d.json" sync > "$W/d1.out"
echo "d: offline -> $(val status < "$W/d1.out")$(val error < "$W/d1.out"), pending $(cw "$H1" pending | val pending)"
grep -q '"status":"offline"' "$W/d1.out" || fail "d: offline save: $(cat "$W/d1.out")"
cw "$H1" sync > "$W/d2.out"
echo "d: back online -> $(val status < "$W/d2.out")"
grep -q '"status":"pushed"' "$W/d2.out" || fail "d: not pushed when back online: $(cat "$W/d2.out")"
fresh; [ "$(cw "$H3" get "$N1" | val value)" = "$(cat "$W/d.json")" ] || fail "d: the offline change is not on the server"

# Put the notes back, in one sync.
cw "$H1" numbers > /dev/null
for n in $N1 $N2 $N3 $N4; do cw "$H1" edit-cached "$n" "$W/orig-$n.json" save > /dev/null || fail "restore $n"; done
cw "$H1" sync > "$W/restore.out"
echo "restore: $(val status < "$W/restore.out")"
fresh
for n in $N1 $N2 $N3 $N4; do
  [ "$(cw "$H3" get "$n" | val value)" = "$(cat "$W/orig-$n.json")" ] || fail "restore: dive $n differs from the start"
done
SE=$(cw "$W" head | val head)

echo "commits written on the server:"
git -C "$(cache "$H3")" log --format='  %h  parents %p  %s | %b' "$S0..$SE" | tr -s '\n' ' ' | sed 's/  \([0-9a-f]\{7\}\)  parents/\n  \1  parents/g'; echo
[ $RESULT = 0 ] && echo "PASSED" || echo "FAILED"
exit $RESULT
