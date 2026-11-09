#!/bin/bash
# Runs the planner tests (built by tests/android/build.sh) on the emulator,
# which runs the code that ships: the same sources compiled by the NDK.
# Only ever the emulator: every adb command carries -s emulator-5554.
# usage: tests/android/run.sh [x86_64]     (the emulator's ABI)
# Exit status: 0 when both tests pass on the device.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
ABI=${1:-x86_64}
SERIAL=emulator-5554
DIR=/data/local/tmp/opendives-plan-tests

# adb: $ADB, the PATH, the Android SDK (also the Windows one, from WSL).
find_adb() {
  if [ -n "${ADB:-}" ]; then echo "$ADB"; return; fi
  if command -v adb >/dev/null 2>&1; then echo adb; return; fi
  for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" /mnt/c/Users/*/AppData/Local/Android/Sdk; do
    for n in adb adb.exe; do [ -n "$d" ] && [ -x "$d/platform-tools/$n" ] && { echo "$d/platform-tools/$n"; return; }; done
  done
  return 1
}
ADB=$(find_adb) || { echo "adb not found: set ADB"; exit 2; }
adb() { "$ADB" -s "$SERIAL" "$@"; }

state=$("$ADB" devices | tr -d '\r' | awk -v s="$SERIAL" '$1 == s { print $2 }')
[ "$state" = device ] || { echo "the emulator $SERIAL is not running"; exit 2; }
device_abi=$(adb shell getprop ro.product.cpu.abi | tr -d '\r')
[ "$device_abi" = "$ABI" ] || { echo "the emulator runs $device_abi, not $ABI"; exit 2; }
echo "device: $(adb shell getprop ro.product.model | tr -d '\r'), $device_abi, Android $(adb shell getprop ro.build.version.release | tr -d '\r')"

B=$ROOT/build/android/tests/$ABI
[ -f "$B/plan_test" ] || { echo "missing $B/plan_test: run tests/android/build.sh $ABI"; exit 2; }
# adb.exe wants a Windows path when it is the Windows one.
winpath() { case "$ADB" in *.exe) wslpath -w "$1" ;; *) echo "$1" ;; esac; }
adb shell "rm -rf $DIR && mkdir -p $DIR" >/dev/null
adb push "$(winpath "$B/plan_test")" "$DIR/plan_test" >/dev/null 2>&1
adb push "$(winpath "$B/plan_oracle")" "$DIR/plan_oracle" >/dev/null 2>&1
adb shell "chmod 755 $DIR/plan_test $DIR/plan_oracle"

status=0
for t in plan_test plan_oracle; do
  # The exit status of the test, which adb shell passes on.
  adb shell "cd $DIR && ./$t; echo EXIT=\$?" | tr -d '\r' > "$ROOT/build/android/tests/$ABI/$t.log"
  code=$(sed -n 's/^EXIT=//p' "$ROOT/build/android/tests/$ABI/$t.log" | tail -1)
  summary=$(grep -E '^[0-9]+ failed$' "$ROOT/build/android/tests/$ABI/$t.log" | tail -1)
  echo "$t on the emulator ($ABI): exit ${code:-?}, ${summary:-no summary}"
  [ "${code:-1}" = 0 ] || { status=1; grep -E '^FAIL' "$ROOT/build/android/tests/$ABI/$t.log" | head -20; }
done
adb shell "rm -rf $DIR" >/dev/null
exit $status
