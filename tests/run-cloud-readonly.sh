#!/bin/bash
# OpenDives — round trip on a real Subsurface cloud log, READ-ONLY.
#
#   0. probe: the log branch exists (otherwise stop); its head is recorded
#   1. load through the core: clone (or update) of the local cache
#   2. copy of the cache -> A, WITHOUT the "origin" remote: nothing can be pushed
#   3. A -> B (fresh repo)       differences listed: A was written by Subsurface
#   4. B -> C (fresh repo)       identical tree                           [strict]
#   5. B -> B (resave)           unchanged tree                           [strict]
#   6. B -> b.xml, C -> c.xml    identical files                          [strict]
#   7. probe: the head of the server branch has not changed              [strict]
#
# Credentials are read from <env-file> (OPENDIVES_CLOUD_EMAIL,
# OPENDIVES_CLOUD_PASSWORD); the password is never printed.
# usage: run-cloud-readonly.sh <cloud> <roundtrip> <env-file> <workdir>
set -euo pipefail
CLOUD=$(realpath "$1"); RT=$(realpath "$2"); ENVF=$3; W=$4
set -a; source <(tr -d '\r' < "$ENVF"); set +a
BR=$OPENDIVES_CLOUD_EMAIL
rm -rf "$W"; mkdir -p "$W/home"; W=$(realpath "$W")
export HOME=$W/home   # core cache: $HOME/.subsurface/cloudstorage/...
tree() { git -C "$1" rev-parse "refs/heads/$BR^{tree}"; }
newrepo() { rm -rf "$1"; git init -q -b "$BR" "$1"; }
fail() { echo "FAILED: $*"; exit 1; }

"$CLOUD" probe | tee "$W/probe1" | grep -v '^head'
HEAD1=$(sed -n 's/^head: //p' "$W/probe1")
grep -q '^branch: present' "$W/probe1" || fail "branch missing on the server"

"$CLOUD" load > "$W/load" 2> "$W/load.log" || { cat "$W/load.log"; fail "load"; }
grep -E '^(loaded|git_local_only)' "$W/load"
CACHE=$(sed -n 's/^cache: //p' "$W/load")
[ "$(git -C "$CACHE" rev-parse "refs/heads/$BR")" = "$HEAD1" ] || fail "the cache does not match the server head"
echo "cache = server head (${HEAD1:0:7}), $(git -C "$CACHE" rev-list --count "refs/heads/$BR") commits"
git -C "$CACHE" log -1 --format='last commit: %an | %s' "refs/heads/$BR"

cp -r "$CACHE" "$W/A"
git -C "$W/A" remote remove origin
git -C "$W/A" remote | grep -q . && fail "the copy still has a remote"
newrepo "$W/B"; newrepo "$W/C"

"$RT" "$W/A[$BR]" "$W/B[$BR]" 2> "$W/log-AB" || fail "A -> B"
grep '^loaded' "$W/log-AB"
if [ "$(tree "$W/A")" = "$(tree "$W/B")" ]; then
  echo "A = B: rewritten tree identical to Subsurface's"
else
  : > "$W/diffAB"
  for p in $( (git -C "$W/A" ls-tree -r --name-only "$BR"; git -C "$W/B" ls-tree -r --name-only "$BR") | sort -u); do
    d=$(diff <(git -C "$W/A" show "$BR:$p" 2>/dev/null) <(git -C "$W/B" show "$BR:$p" 2>/dev/null) | grep '^[<>]' || true)
    [ -n "$d" ] && printf '== %s\n%s\n' "$p" "$d" >> "$W/diffAB"
  done
  echo "A != B: $(grep -c '^== ' "$W/diffAB") file(s) differ; keywords:" \
    $(grep '^[<>]' "$W/diffAB" | cut -c3- | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -12 | awk '{print $2"("$1")"}')
  echo "details: $W/diffAB"
fi

BAD=""
bad() { BAD="$BAD; $*"; echo "difference: $*"; }
"$RT" "$W/B[$BR]" "$W/C[$BR]" 2> "$W/log-BC" || fail "B -> C"
if [ "$(tree "$W/B")" != "$(tree "$W/C")" ]; then
  git -C "$W/B" fetch -q "$W/C" "refs/heads/$BR:refs/heads/c-copy"
  bad "tree B != tree C ($(git -C "$W/B" diff --name-only "refs/heads/$BR" c-copy | wc -l) file(s), see git -C $W/B diff $BR c-copy)"
fi
TB=$(tree "$W/B")
"$RT" "$W/B[$BR]" "$W/B[$BR]" 2> "$W/log-BB" || fail "B -> B"
[ "$TB" = "$(tree "$W/B")" ] || bad "tree changed on resave"
"$RT" "$W/B[$BR]" "$W/b.xml" 2> "$W/log-bx" && "$RT" "$W/C[$BR]" "$W/c.xml" 2> "$W/log-cx" || fail "XML export"
cmp -s "$W/b.xml" "$W/c.xml" || bad "b.xml != c.xml ($(diff "$W/b.xml" "$W/c.xml" | grep -c '^[<>]') line(s))"

"$CLOUD" probe > "$W/probe2"
HEAD2=$(sed -n 's/^head: //p' "$W/probe2")
[ "$HEAD1" = "$HEAD2" ] || fail "the server branch head changed: ${HEAD1:0:7} -> ${HEAD2:0:7}"
echo "server unchanged (${HEAD2:0:7})"
[ -z "$BAD" ] && echo "PASSED" || { echo "STRICT DIFFERENCES:${BAD#;}"; exit 1; }
