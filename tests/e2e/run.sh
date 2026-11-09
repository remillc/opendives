#!/bin/bash
# Builds the app as it ships (debug APK, x86_64 core), installs it on the
# emulator-5554 and runs the planner scenarios in it (tests/e2e/planner-e2e.mjs).
# Only ever the emulator. The account of the emulator must be the test account.
# Needs: the NDK (native/install-ndk.sh), JDK 21 (JAVA_HOME), the Android SDK (ANDROID_HOME),
# node, and under WSL powershell.exe to run Gradle on Windows (AGENTS.md, "Android app").
# usage: tests/e2e/run.sh [--no-build]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SERIAL=emulator-5554

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
[ "$("$ADB" devices | tr -d '\r' | awk -v s="$SERIAL" '$1 == s { print $2 }')" = device ] || { echo "the emulator $SERIAL is not running"; exit 2; }
winpath() { case "$ADB" in *.exe) wslpath -w "$1" ;; *) echo "$1" ;; esac; }

if [ "${1:-}" != --no-build ]; then
  native/build-android.sh x86_64
  (cd app && npm ci --no-audit --no-fund && npm run android:sync)
  if grep -qi microsoft /proc/version 2>/dev/null; then
    # Gradle runs on Windows, with JDK 21 and the Windows Android SDK.
    WINAPP=$(wslpath -w "$ROOT/app/android")
    powershell.exe -NoProfile -Command "\$env:JAVA_HOME = if (\$env:JAVA_HOME) { \$env:JAVA_HOME } else { 'C:\\Program Files\\Java\\jdk-21' }; \$env:ANDROID_HOME = if (\$env:ANDROID_HOME) { \$env:ANDROID_HOME } else { \"\$env:LOCALAPPDATA\\Android\\Sdk\" }; Set-Location '$WINAPP'; .\\gradlew.bat assembleDebug"
  else
    (cd app/android && ./gradlew assembleDebug)
  fi
fi
APK=$ROOT/app/android/app/build/outputs/apk/debug/app-debug.apk
[ -f "$APK" ] || { echo "no APK: $APK"; exit 2; }
adb install -r "$(winpath "$APK")" | tail -1
adb shell am force-stop org.opendives.app
adb shell monkey -p org.opendives.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
# The app loads the log: wait for the account screen to be filled.
sleep 20
case "$ADB" in *.exe) NODE=node.exe ;; *) NODE=node ;; esac # the adb forward lives where adb runs
"$NODE" tests/e2e/planner-e2e.mjs
