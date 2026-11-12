#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Installs the app in an iOS simulator, starts it, and keeps screenshots and
# its log in build/ios/app-run. Exit status: 0 when the app started and stayed up.
# usage: tests/ios/run-app.sh <path of App.app>
set -uo pipefail
source "$(dirname "$0")/../../native/ios/env.sh"
APP=$1
L=$OUT/app-run
rm -rf "$L"; mkdir -p "$L"
BUNDLE=org.opendives.app

UDID=$(pick_simulator) || { echo "no iPhone simulator available"; exit 2; }
# A fresh boot: after the core's tests in the same simulator, the launch hung without a word.
xcrun simctl shutdown "$UDID" 2>/dev/null
xcrun simctl boot "$UDID" 2>/dev/null
xcrun simctl bootstatus "$UDID" -b >/dev/null || { echo "the simulator did not boot"; exit 2; }
# bootstatus can return before SpringBoard takes launches: wait for it, then let it settle.
for i in $(seq 1 30); do
  xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | grep -q "com.apple.SpringBoard" && break
  sleep 2
done
sleep 10
# A copy that also prints the stack of the page's errors (tests/ios/catch-errors.js).
COPY=$L/App.app
cp -R "$APP" "$COPY"
cp "$ROOT/tests/ios/catch-errors.js" "$COPY/public/"
perl -0pi -e 's#<head>#<head><script src="catch-errors.js"></script>#' "$COPY/public/index.html"
codesign --force --sign - --preserve-metadata=entitlements,identifier "$COPY" >/dev/null 2>&1
xcrun simctl install "$UDID" "$COPY" || exit 1
rm -rf "$COPY"

# Is the app's process alive? A registered job without a PID ("-") is a dead one.
app_alive() {
  xcrun simctl spawn "$UDID" launchctl list 2>/dev/null | awk -v b="UIKitApplication:$BUNDLE" 'index($3, b) == 1 && $1 != "-" { found = 1 } END { exit !found }'
}

# One start: launches, waits up to 90 s for the page ("WebView loaded"), then
# 30 s more during which the app must stay alive. A launch that never happens
# or an app that dies is tried again (3 attempts, each one reported): the
# simulator itself sometimes loses a launch, but a real crash or white screen
# fails every attempt.
CONSOLE=
ok=0
for attempt in 1 2 3; do
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null
  [ -n "$CONSOLE" ] && kill "$CONSOLE" 2>/dev/null
  # A pseudo-terminal, or the app's print() stays in its buffer until it exits.
  xcrun simctl launch --console-pty "$UDID" "$BUNDLE" > "$L/console.log" 2>&1 &
  CONSOLE=$!
  loaded=0
  for s in $(seq 1 45); do
    sleep 2
    if grep -q "WebView loaded" "$L/console.log"; then loaded=1; break; fi
  done
  if [ "$loaded" = 0 ]; then
    echo "attempt $attempt: the page did not load in 90 s (app alive: $(app_alive && echo yes || echo no))"
    cp "$L/console.log" "$L/console-attempt-$attempt.log"
    xcrun simctl io "$UDID" screenshot "$L/failed-attempt-$attempt.png" >/dev/null
    continue
  fi
  n=0
  for wait in 10 10 10; do
    sleep "$wait"; n=$((n + wait))
    xcrun simctl io "$UDID" screenshot "$L/start-$n.png" >/dev/null
  done
  if app_alive; then ok=1; break; fi
  echo "attempt $attempt: the app died after its page loaded"
  cp "$L/console.log" "$L/console-attempt-$attempt.log"
done
status=0
[ "$ok" = 1 ] || { echo "the app did not start and stay up in 3 attempts"; status=1; }
cp "$L/start-30.png" "$L/start.png" 2>/dev/null
xcrun simctl spawn "$UDID" log show --last 5m --style compact --predicate 'process == "App"' > "$L/app.log" 2>&1
# Crash reports, if the app crashed.
cp "$HOME"/Library/Logs/DiagnosticReports/App*.ips "$L/" 2>/dev/null
kill "$CONSOLE" 2>/dev/null
cut -c1-300 "$L/console.log" | head -150
# A white page compresses to about 75 KB, the first screen to more than 300 KB.
size=$(stat -f %z "$L/start.png" 2>/dev/null || echo 0)
echo "screenshot: $size bytes"
[ "$size" -gt 150000 ] || { echo "the screen is blank"; status=1; }
# The home screen is heavy too: the page itself must have loaded.
grep -q "WebView loaded" "$L/console.log" || { echo "the app's page never loaded"; status=1; }

# The icon on the home screen and the launch screen, light then dark (looked at, not checked).
# The launch is fast and LaunchCover only keeps the launch screen until the first
# screen is drawn: screenshots are taken in a loop from just before the launch.
for look in light dark; do
  xcrun simctl ui "$UDID" appearance "$look"
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null
  sleep 4
  xcrun simctl io "$UDID" screenshot "$L/home-$look.png" >/dev/null
  # OD_HOLD_LAUNCH_SCREEN: LaunchCover keeps the launch screen 8 s after the first screen is drawn.
  SIMCTL_CHILD_OD_HOLD_LAUNCH_SCREEN=1 xcrun simctl launch --console-pty "$UDID" "$BUNDLE" > "$L/launch-$look.log" 2>&1 &
  LAUNCH=$!
  for i in 1 2 3 4 5; do xcrun simctl io "$UDID" screenshot "$L/launch-$look-$i.png" >/dev/null 2>&1; done
  sleep 10
  xcrun simctl io "$UDID" screenshot "$L/start-$look.png" >/dev/null
  kill "$LAUNCH" 2>/dev/null
done
xcrun simctl shutdown "$UDID" 2>/dev/null
exit $status
