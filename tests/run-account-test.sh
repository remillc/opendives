#!/bin/bash
# New account and divelogs.de (tests/account_test.cpp). Offline checks, then,
# with the credential files, the questions to the server that create nothing
# on the EXISTING test account: "/storage" with its password answers
# "verified", and the first logbook is refused (LOG_EXISTS). Refuses any other
# account. The password is never printed.
# usage: run-account-test.sh <account> [<dev-env> <test-env>]
set -uo pipefail
ACC=$(realpath "$1")
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
if [ $# -ge 3 ]; then
  set -a; source <(tr -d '\r' < "$2"); source <(tr -d '\r' < "$3"); set +a
  lc() { tr '[:upper:]' '[:lower:]' <<< "$1"; }
  [ -n "${OPENDIVES_CLOUD_TEST_EMAIL:-}" ] && [ "$(lc "$OPENDIVES_CLOUD_EMAIL")" = "$(lc "$OPENDIVES_CLOUD_TEST_EMAIL")" ] ||
    { echo "REFUSED: the account is not the test account"; exit 2; }
else
  unset OPENDIVES_CLOUD_EMAIL OPENDIVES_CLOUD_PASSWORD OPENDIVES_CLOUD_TEST_EMAIL
fi
# A fresh $HOME: no local copy of the account's log.
HOME=$W "$ACC" "$ROOT/tests/data/divelogs-available-dives.xml" "$ROOT/third_party/subsurface/dives/SampleDivesV2.ssrf"
