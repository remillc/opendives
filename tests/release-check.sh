#!/bin/bash
# The planner's release check: its success is required for any release.
#
#   tests/release-check.sh            everything, on this machine and on the emulator (about 25 min)
#   tests/release-check.sh --ci       what needs no device (the report is not "complete")
#   tests/release-check.sh --verify [commit]
#                                     checks that a complete, green report exists for the commit (default
#                                     HEAD) and for the Subsurface commit pinned in it: the release lock
#
# The checks, in order:
#   build        poc/build.sh (the core, the façade and the test programs, on this machine)
#   reference    the 17 cases of Subsurface's testplan.cpp through the façade (tests/plan_test.cpp)
#   oracle       the independent ZH-L16C checker over a grid of 360 plans (tests/plan_oracle.cpp)
#   app          the app chain: conversions, request, displayed values, alarms (tests/app, node:test)
#   mutations    wrong inputs sent to each of the three: every one must make it fail
#   android      the first two compiled with the NDK and run on emulator-5554 (x86_64); arm64 compiled only
#   e2e          the scenarios in the real app on the emulator (tests/e2e)
#
# The report, build/release-check/report-<commit>.json, names the commit, whether the tree
# was clean, the Subsurface commit, and each check. A report of a dirty tree is never valid.
# Changing an expected value in these tests needs a commit that says why.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
OUT=$ROOT/build/release-check
# Under WSL, node is the Windows one, and a Windows program only sees the variables listed in WSLENV.
NODE=$(command -v node || command -v node.exe || true)
[ -n "$NODE" ] || { echo "node not found"; exit 2; }
export WSLENV="${WSLENV:+$WSLENV:}OD_JS_MUTATE"
# A git worktree made by Windows git has a .git file WSL's git cannot follow: use git.exe then.
GIT=git
git rev-parse HEAD >/dev/null 2>&1 || GIT=git.exe
git() { "$GIT" "$@" | tr -d '\r'; }
mkdir -p "$OUT/logs"

commit() { git rev-parse HEAD; }
pinned() { git ls-tree HEAD third_party/subsurface | awk '{ print $3 }'; }

# --- --verify -----------------------------------------------------------------------
if [ "${1:-}" = --verify ]; then
  c=$(git rev-parse "${2:-HEAD}") || exit 1
  r=$OUT/report-$c.json
  [ -f "$r" ] || { echo "NO REPORT for $c: run tests/release-check.sh on this commit"; exit 1; }
  "$NODE" -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const bad = [];
    if (r.commit !== process.argv[2]) bad.push("the report is for another commit");
    if (r.dirty) bad.push("the tree was not clean");
    if (r.scope !== "full") bad.push("the report is not a full run (" + r.scope + ")");
    if (r.subsurface !== process.argv[3]) bad.push("the Subsurface commit differs (" + r.subsurface + ")");
    for (const s of r.steps) if (s.status !== "pass") bad.push(s.name + ": " + s.status);
    if (!r.steps.length) bad.push("no steps");
    if (bad.length) { console.log("RED: " + bad.join("; ")); process.exit(1); }
    console.log("GREEN: " + r.steps.length + " checks, commit " + r.commit.slice(0, 10) + ", Subsurface " + r.subsurface.slice(0, 10) + ", " + r.date);
  ' "$(case "$NODE" in *.exe) wslpath -w "$r" ;; *) echo "$r" ;; esac)" "$c" "$(git ls-tree "$c" third_party/subsurface | awk '{ print $3 }')"
  exit $?
fi

SCOPE=full
for a in "$@"; do
  case $a in
    --ci) SCOPE=ci ;;
    *) echo "unknown option $a"; exit 2 ;;
  esac
done

STEPS=()
FAILED=0
now() { date +%s; }
START=$(now)

# step <name> <command...> : runs it, keeps its output in logs/<name>.log, records the result.
step() {
  local name=$1; shift
  local t0; t0=$(now)
  printf '== %-12s ' "$name"
  if "$@" >"$OUT/logs/$name.log" 2>&1; then status=pass; else status=fail; FAILED=1; fi
  local secs=$(( $(now) - t0 ))
  local detail; detail=$(tail -n 1 "$OUT/logs/$name.log" | tr -d '"\\' | cut -c1-200)
  echo "$status (${secs}s) $detail"
  [ "$status" = pass ] || tail -n 25 "$OUT/logs/$name.log" | sed 's/^/     | /'
  STEPS+=("{\"name\":\"$name\",\"status\":\"$status\",\"seconds\":$secs,\"detail\":\"$detail\"}")
}
skip() { echo "== $1 skipped ($2)"; STEPS+=("{\"name\":\"$1\",\"status\":\"skipped\",\"seconds\":0,\"detail\":\"$2\"}"); }

# A mutation must make the program fail (non-zero exit): it proves the checks detect the error.
mutations_cpp() {
  local bad=0
  for prog in plan plan-oracle; do
    for m in sac gf vpmb ascent water altitude; do
      if OD_MUTATE=$m "build/poc/$prog" >"$OUT/logs/mutation-$prog-$m.log" 2>&1; then
        echo "NOT DETECTED: $prog with $m"; bad=1
      else
        echo "detected: $prog with $m ($(grep -c '^FAIL' "$OUT/logs/mutation-$prog-$m.log") failures)"
      fi
    done
  done
  return $bad
}
mutations_js() {
  local bad=0
  for m in psi cuft ft mod decomodel; do
    if OD_JS_MUTATE=$m "$NODE" --import ./tests/app/register.mjs --test tests/app/planner.test.mjs >"$OUT/logs/mutation-app-$m.log" 2>&1; then
      echo "NOT DETECTED: app with $m"; bad=1
    else
      echo "detected: app with $m"
    fi
  done
  return $bad
}
mutations() { local a=0 b=0; mutations_cpp || a=1; mutations_js || b=1; [ $a = 0 ] && [ $b = 0 ] && echo "all 19 mutations detected"; return $(( a | b )); }

app_deps() { [ -d app/node_modules/svelte ] || (cd app && npm ci --no-audit --no-fund); }
app_tests() { app_deps && "$NODE" --import ./tests/app/register.mjs --test tests/app/planner.test.mjs; }
summary_of() { grep -E '^(ℹ )?(pass|fail) ' "$1" 2>/dev/null | tr '\n' ' '; }

step build poc/build.sh
step reference bash -c 'set -o pipefail; build/poc/plan | tail -n 6'
step oracle bash -c 'set -o pipefail; build/poc/plan-oracle | tail -n 12'
step app app_tests
step mutations mutations

if [ "$SCOPE" = full ]; then
  step android bash -c 'tests/android/build.sh x86_64 arm64-v8a && tests/android/run.sh x86_64 && echo "x86_64: run on the emulator; arm64-v8a: compiled, not run (no arm64 device)"'
  step e2e tests/e2e/run.sh
else
  skip android "no device in this run"
  skip e2e "no device in this run"
fi

DIRTY=false
[ -n "$(git status --porcelain)" ] && DIRTY=true
C=$(commit)
REPORT=$OUT/report-$C.json
{
  printf '{"commit":"%s","dirty":%s,"subsurface":"%s","scope":"%s","date":"%s","host":"%s","seconds":%d,"steps":[' \
    "$C" "$DIRTY" "$(pinned)" "$SCOPE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(uname -sr)" $(( $(now) - START ))
  (IFS=,; printf '%s' "${STEPS[*]}")
  printf ']}\n'
} > "$REPORT"
cp "$REPORT" "$OUT/report.json"
echo
if [ $FAILED != 0 ]; then
  echo "RED: a check failed; see $OUT/logs"
  exit 1
fi
if [ "$SCOPE" = ci ]; then
  echo "GREEN, without a device (--ci): not a release report"
  exit 0
fi
if [ "$DIRTY" = true ]; then
  echo "the working tree is not clean: this report cannot release anything"
  exit 3
fi
echo "GREEN for $C (Subsurface $(pinned | cut -c1-10)): $REPORT"
exit 0
