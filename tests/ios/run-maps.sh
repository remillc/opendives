#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Runs tests/ios/maps-test.js inside a copy of the app, in an iPhone or iPad
# simulator, and keeps its console and a screenshot in build/ios/maps-<kind>.
# The app given is not changed: the test goes into a copy.
# usage: tests/ios/run-maps.sh <path of App.app> [iPhone|iPad] [limit]
#   limit: also the 50 MiB stop (downloads about 50 MiB from the tile server)
set -uo pipefail
source "$(dirname "$0")/../../native/ios/env.sh"
APP=$1
KIND=${2:-iPhone}
LIMIT=${3:-}
L=$OUT/maps-$KIND
rm -rf "$L"; mkdir -p "$L"
BUNDLE=org.opendives.app

COPY=$L/App.app
cp -R "$APP" "$COPY"
cp "$ROOT/tests/ios/maps-test.js" "$COPY/public/maps-test.js"
flag=""
[ "$LIMIT" = limit ] && flag="<script>window.OD_MAPS_LIMIT_TEST = true</script>"
perl -0pi -e "s#</body>#$flag<script src=\"maps-test.js\"></script></body>#" "$COPY/public/index.html"
grep -q maps-test.js "$COPY/public/index.html" || { echo "the test could not be added to the page"; exit 2; }
codesign --force --sign - --preserve-metadata=entitlements,identifier "$COPY" >/dev/null 2>&1

# A device of that kind on the most recent iOS runtime installed.
UDID=$(xcrun simctl list devices available -j | KIND="$KIND" python3 -c '
import json, os, re, sys
kind = os.environ["KIND"]
devices = json.load(sys.stdin)["devices"]
runtimes = [k for k in devices if ".iOS-" in k and any(kind in d["name"] for d in devices[k])]
runtime = max(runtimes, key=lambda k: [int(n) for n in re.findall(r"\d+", k.rsplit(".iOS-", 1)[1])])
print(next(d["udid"] for d in devices[runtime] if kind in d["name"]))
') || { echo "no $KIND simulator available"; exit 2; }
echo "$KIND simulator $UDID"
xcrun simctl boot "$UDID" 2>/dev/null
xcrun simctl bootstatus "$UDID" -b >/dev/null || { echo "the simulator did not boot"; exit 2; }
xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null
xcrun simctl install "$UDID" "$COPY" || exit 1
xcrun simctl launch --console-pty "$UDID" "$BUNDLE" > "$L/console.log" 2>&1 &
CONSOLE=$!

# The scenario takes a few minutes; the limit, up to 15 more.
limit=600
[ "$LIMIT" = limit ] && limit=1500
for ((t = 0; t < limit; t += 10)); do
  grep -q "MAPS-TEST END" "$L/console.log" && break
  sleep 10
done
xcrun simctl io "$UDID" screenshot "$L/end.png" >/dev/null
kill "$CONSOLE" 2>/dev/null
xcrun simctl shutdown "$UDID" 2>/dev/null
rm -rf "$COPY"

grep -E "MAPS-TEST|mapsDownload|Error|error" "$L/console.log" | cut -c1-400 | head -200
grep -q "MAPS-TEST END passed=[0-9]* failed=0" "$L/console.log" || { echo "the maps scenario did not pass"; exit 1; }
