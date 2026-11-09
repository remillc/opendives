#!/bin/bash
# Own git repository instead of the cloud (tests/git_remote_test.cpp): the
# façade against local repositories served by `git daemon` (git://), with fake
# credentials. Nothing leaves this machine.
#   1. the rules of git_check / git_configure (HTTPS only, no credentials in
#      an address, bad names), and leaving git mode;
#   2. git_check: a public repository (branches), an empty one, a missing one;
#   3. an empty repository: the first push creates the branch, once;
#   4. a repository that is not empty is never written when its branch is
#      missing (git_create_log refuses, so does a plain open);
#   5. a second device reads what the first one wrote; an edit is pushed;
#   6. server unreachable: the edit stays on the device (offline), and is sent
#      when the server is back;
#   7. the fake token is nowhere: not in a local copy, not in an output.
# Keep the work directory on a Linux file system (under WSL, not /mnt/...).
# usage: run-git-remote-test.sh <git-remote> <workdir>
set -uo pipefail
GR=$(realpath "$1"); W=$2
PORT=${PORT:-19431}
TOKEN=FAKEtoken0123456789abcdef
rm -rf "$W"; mkdir -p "$W/srv" "$W/out"
fails=0
ok()   { echo "PASS $1"; }
fail() { echo "FAIL $1"; fails=$((fails + 1)); }
check() { if eval "$2"; then ok "$1"; else fail "$1"; fi; }
out() { cat "$W/out/$1"; }

start_daemon() {
  git daemon --export-all --enable=receive-pack --base-path="$W/srv" --listen=127.0.0.1 --port=$PORT --reuseaddr \
    --pid-file="$W/daemon.pid" --detach "$W/srv"
  sleep 0.5
}
stop_daemon() { kill "$(cat "$W/daemon.pid")" 2>/dev/null; sleep 0.5; }
trap 'stop_daemon' EXIT
URL=git://127.0.0.1:$PORT
run() { # home name args...
  local home=$1 name=$2; shift 2
  mkdir -p "$W/$home"
  HOME="$W/$home" "$GR" "$@" > "$W/out/$name" 2> "$W/out/$name.err"
}
refs() { git -C "$1" for-each-ref --format='%(refname) %(objectname)'; }
GIT="git -c user.name=test -c user.email=test@example.invalid"

# Repositories: an empty one, and one with two branches that is not a log.
git init -q --bare -b main "$W/srv/empty.git"
git init -q --bare -b main "$W/srv/full.git"
git init -q -b main "$W/seed"
echo "not a dive log" > "$W/seed/README"
git -C "$W/seed" add README
$GIT -C "$W/seed" commit -q -m seed
git -C "$W/seed" branch other
git -C "$W/seed" push -q "$W/srv/full.git" main other
start_daemon

# 1. Rules.
if run h0 selftest selftest; then ok "selftest ($(grep -c '^ok' "$W/out/selftest") checks)"; else fail "selftest"; grep FAIL "$W/out/selftest"; fi

# 2. git_check.
run h0 c-full check "$URL/full.git"
check "check: a public repository" "grep -q '\"status\":\"public\"' '$W/out/c-full' && grep -q '\"main\",\"other\"\\|\"other\",\"main\"' '$W/out/c-full' && grep -q '\"empty\":false' '$W/out/c-full'"
run h0 c-empty check "$URL/empty.git"
check "check: an empty repository" "grep -q '\"status\":\"public\"' '$W/out/c-empty' && grep -q '\"empty\":true' '$W/out/c-empty' && grep -q '\"branches\":\\[\\]' '$W/out/c-empty'"
run h0 c-none check "$URL/missing.git"
check "check: no repository" "grep -q '\"status\":\"none\"' '$W/out/c-none'"
run h0 c-tok check "$URL/full.git" someone "$TOKEN"
check "check: with a token (push advertisement)" "grep -q '\"status\":\"ok\"' '$W/out/c-tok'"

# 3. The first push creates the branch.
BEFORE_FULL=$(refs "$W/srv/full.git")
check "empty repository has no reference" "[ -z \"\$(refs '$W/srv/empty.git')\" ]"
run h1 create create "$URL/empty.git" someone "$TOKEN" main
check "create: the branch is made" "grep -q '^json=' '$W/out/create' && git -C '$W/srv/empty.git' rev-parse -q --verify refs/heads/main >/dev/null"
check "create: one commit" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 1 ]"
run h1b create-again create "$URL/empty.git" someone "$TOKEN" main
check "create twice: refused (LOG_EXISTS)" "grep -q 'error=LOG_EXISTS' '$W/out/create-again'"

# 4. Never write to a repository that is not empty.
run h1c create-full create "$URL/full.git" someone "$TOKEN" dev
check "create on a repository with refs: refused (NOT_EMPTY)" "grep -q 'error=NOT_EMPTY' '$W/out/create-full'"
run h1d open-missing open "$URL/full.git" someone "$TOKEN" nope
check "open a missing branch: refused" "grep -q '^error=' '$W/out/open-missing'"
check "the repository with refs is untouched" "[ \"\$(refs '$W/srv/full.git')\" = \"$BEFORE_FULL\" ]"
check "no local copy left by a refusal" "! ls '$W/h1c/.subsurface' >/dev/null 2>&1 || [ -z \"\$(find '$W/h1c/.subsurface' -mindepth 2 -maxdepth 3 -name '*.git' 2>/dev/null)\" ]"

# 5. A second device, an edit.
run h2 open2 open "$URL/empty.git" someone "$TOKEN" main edit
check "device 2 reads the new log (no dive)" "grep -q '^dives=0' '$W/out/open2'"
check "the edit was waiting, then sent" "grep -q '^pending=some' '$W/out/open2' && grep -q '^pendingAfter=0' '$W/out/open2' && grep -q 'pushed' '$W/out/open2'"
check "the remote got the commit" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 2 ]"
run h3 open3 open "$URL/empty.git" someone "$TOKEN" main
check "device 3 sees the dive" "grep -q '^dives=1' '$W/out/open3' && grep -q '^synced=true' '$W/out/open3'"

# 6. Server unreachable, then back.
stop_daemon
TIP=$(git -C "$W/srv/empty.git" rev-parse main)
run h2 offline offline "$URL/empty.git" someone "$TOKEN" main edit
check "offline: the copy is read" "grep -q '^dives=1' '$W/out/offline' && grep -q '^synced=false' '$W/out/offline'"
check "offline: the edit stays on the device" "grep -q '^pendingAfter=some' '$W/out/offline' && grep -q 'offline' '$W/out/offline'"
check "offline: the remote is unchanged" "[ \"\$(git -C '$W/srv/empty.git' rev-parse main)\" = \"$TIP\" ]"
start_daemon
run h2 back open "$URL/empty.git" someone "$TOKEN" main
check "back online: the edit is sent" "[ \"\$(git -C '$W/srv/empty.git' rev-list --count main)\" = 3 ]"

# 7. The token is nowhere.
check "the token is not in a local copy" "! grep -rqa '$TOKEN' '$W'/h1 '$W'/h2 '$W'/h3 2>/dev/null"
check "the token is not in an output" "! grep -rqa '$TOKEN' '$W/out'"
check "the token is not in the remote" "! grep -rqa '$TOKEN' '$W/srv'"

echo "failed: $fails"
[ "$fails" = 0 ]
