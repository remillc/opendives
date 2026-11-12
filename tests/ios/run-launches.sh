#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Installs the app afresh and starts it N times in the iPhone simulator, with
# tests/ios/catch-errors.js, to catch an intermittent start-up error. Keeps each
# console in build/ios/launches. Exit status: 1 if any start failed.
# usage: tests/ios/run-launches.sh <path of App.app> <N>
set -uo pipefail
source "$(dirname "$0")/../../native/ios/env.sh"
APP=$1
N=${2:-10}
L=$OUT/launches
rm -rf "$L"; mkdir -p "$L"
BUNDLE=org.opendives.app

COPY=$L/App.app
cp -R "$APP" "$COPY"
cp "$ROOT/tests/ios/catch-errors.js" "$COPY/public/"
perl -0pi -e 's#<head>#<head><script src="catch-errors.js"></script>#' "$COPY/public/index.html"
codesign --force --sign - --preserve-metadata=entitlements,identifier "$COPY" >/dev/null 2>&1

UDID=$(pick_simulator) || { echo "no iPhone simulator available"; exit 2; }
xcrun simctl shutdown "$UDID" 2>/dev/null
xcrun simctl boot "$UDID" 2>/dev/null
xcrun simctl bootstatus "$UDID" -b >/dev/null || { echo "the simulator did not boot"; exit 2; }
bad=0
for i in $(seq 1 "$N"); do
  xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null
  xcrun simctl install "$UDID" "$COPY" || exit 1
  xcrun simctl launch --console-pty "$UDID" "$BUNDLE" > "$L/console-$i.log" 2>&1 &
  CONSOLE=$!
  sleep 25
  xcrun simctl io "$UDID" screenshot "$L/screen-$i.png" >/dev/null
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null
  kill "$CONSOLE" 2>/dev/null
  size=$(stat -f %z "$L/screen-$i.png")
  if grep -qE "STARTUP JS ERROR|JS-ERROR" "$L/console-$i.log" || [ "$size" -lt 150000 ]; then
    bad=$((bad + 1))
    echo "start $i: FAILED (screenshot $size bytes)"
    grep -A12 -E "STARTUP JS ERROR|JS-ERROR" "$L/console-$i.log" | cut -c1-300 | head -60
  else
    echo "start $i: ok"
  fi
done
xcrun simctl shutdown "$UDID" 2>/dev/null
rm -rf "$COPY"
echo "$bad of $N starts failed"
[ "$bad" = 0 ]
