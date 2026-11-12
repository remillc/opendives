#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Runs OpenDives' tests, compiled for iOS, in an iOS simulator:
#   - the round trip over Subsurface's sample logs (run-roundtrip.sh, unchanged),
#     expected: 97 passed, 1 known failure (TestDiveSeabearNewFormat.xml);
#   - the planner tests (plan_test, plan_oracle).
# usage: tests/ios/run-simulator.sh     (after native/build-ios.sh)
# Exit status: 0 when every result is the expected one.
set -uo pipefail
source "$(dirname "$0")/../../native/ios/env.sh"
B=$OUT/core/sim-arm64
L=$OUT/test-logs
rm -rf "$L"; mkdir -p "$L"
for t in roundtrip plan_test plan_oracle; do
  [ -x "$B/$t" ] || { echo "missing $B/$t: run native/ios/build-ios.sh sim-arm64"; exit 2; }
done

UDID=$(pick_simulator) || { echo "no iPhone simulator available"; exit 2; }
xcrun simctl boot "$UDID" 2>/dev/null
xcrun simctl bootstatus "$UDID" -b >/dev/null || { echo "the simulator did not boot"; exit 2; }
xcrun simctl list devices | grep "$UDID"

status=0

# run-roundtrip.sh takes the program to run: here, one that runs it in the
# simulator. A simulated process sees the Mac's files, so paths are unchanged.
WRAP=$OUT/roundtrip-in-simulator
cat > "$WRAP" <<EOF
#!/bin/bash
exec xcrun simctl spawn "$UDID" "$B/roundtrip" "\$@"
EOF
chmod +x "$WRAP"
bash "$ROOT/tests/run-roundtrip.sh" "$WRAP" "$OUT/rt" "$SS"/dives/*.xml "$SS"/dives/*.ssrf > "$L/roundtrip.log" 2>&1
summary=$(tail -1 "$L/roundtrip.log")
echo "roundtrip in the simulator: $summary"
if [ "$summary" != "passed: 97  failed: 1" ] || [ "$(grep -c '^FAIL' "$L/roundtrip.log")" != 1 ] ||
   ! grep -q '^FAIL TestDiveSeabearNewFormat.xml ' "$L/roundtrip.log"; then
  status=1
  grep '^FAIL' "$L/roundtrip.log" | head -20
fi

for t in plan_test plan_oracle; do
  code=0
  xcrun simctl spawn "$UDID" "$B/$t" > "$L/$t.log" 2>&1 || code=$?
  summary=$(grep -E '^[0-9]+ failed$' "$L/$t.log" | tail -1)
  echo "$t in the simulator: exit $code, ${summary:-no summary}"
  if [ "$code" != 0 ] || [ "$summary" != "0 failed" ]; then
    status=1
    grep -E '^FAIL' "$L/$t.log" | head -20
    tail -5 "$L/$t.log"
  fi
done

xcrun simctl shutdown "$UDID" 2>/dev/null
exit $status
