#!/bin/bash
# OpenDives POC — round-trip test over Subsurface sample logs.
#
# For each sample:
#   1. sample -> git repo A                  (first import, Subsurface normalises)
#   2. git A  -> git repo B (fresh)          differences A/B are reported: they
#                                            come from Subsurface's own loaders
#                                            (e.g. legacy deviceid dropped,
#                                            meandepth recomputed from samples)
#   3. git B  -> git repo C (fresh)          tree(C) must equal tree(B) exactly  [strict]
#   4. git B  -> git B (save on top)         tree must not change
#   5. git B  -> b.xml, git C -> c.xml       b.xml must equal c.xml exactly
#
# usage: run-roundtrip.sh <roundtrip-binary> <workdir> <sample>...

RT=$1; W=$2; shift 2
pass=0; fail=0
tree() { git -C "$1" rev-parse 'main^{tree}'; }
newrepo() { rm -rf "$1"; git init -q -b main "$1"; }

for s in "$@"; do
  n=$(basename "$s"); d="$W/$n"; rm -rf "$d"; mkdir -p "$d"
  why=""; note=""
  newrepo "$d/A"; newrepo "$d/B"; newrepo "$d/C"
  "$RT" "$s" "$d/A[main]" 2>"$d/log1" || why="load or save to git"
  [ -z "$why" ] && { "$RT" "$d/A[main]" "$d/B[main]" 2>"$d/log2" || why="git A -> git B"; }
  if [ -z "$why" ] && [ "$(tree "$d/A")" != "$(tree "$d/B")" ]; then
    : > "$d/diffAB"
    for p in $(git -C "$d/A" ls-tree -r --name-only main) $(git -C "$d/B" ls-tree -r --name-only main); do
      diff <(git -C "$d/A" show "main:$p" 2>/dev/null) <(git -C "$d/B" show "main:$p" 2>/dev/null) | grep '^[<>]' >> "$d/diffAB"
    done 2>/dev/null
    # Differences between the first import and the first git reload come from
    # Subsurface's own loaders (unmodified code); they are listed, not failed.
    note="normalised:$(grep '^[<>]' "$d/diffAB" | cut -c3- | cut -d' ' -f1 | sort -u | tr '\n' ' ')"
  fi
  [ -z "$why" ] && { "$RT" "$d/B[main]" "$d/C[main]" 2>"$d/log3" || why="git B -> git C"; }
  [ -z "$why" ] && [ "$(tree "$d/B")" != "$(tree "$d/C")" ] && why="tree B != tree C"
  if [ -z "$why" ]; then
    TB=$(tree "$d/B")
    "$RT" "$d/B[main]" "$d/B[main]" 2>"$d/log4" || why="git B -> git B"
    [ -z "$why" ] && [ "$TB" != "$(tree "$d/B")" ] && why="tree changed on resave"
  fi
  [ -z "$why" ] && { "$RT" "$d/B[main]" "$d/b.xml" 2>"$d/log5" && "$RT" "$d/C[main]" "$d/c.xml" 2>"$d/log6" || why="git -> xml"; }
  [ -z "$why" ] && { cmp -s "$d/b.xml" "$d/c.xml" || why="b.xml != c.xml"; }
  if [ -z "$why" ]; then
    pass=$((pass+1)); printf 'PASS %-42s %s %s\n' "$n" "$(grep '^loaded' "$d/log1")" "$note"
  else
    fail=$((fail+1)); printf 'FAIL %-42s %s\n' "$n" "$why"
  fi
done
echo "passed: $pass  failed: $fail"
[ $fail = 0 ]
