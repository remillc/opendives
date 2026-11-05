#!/bin/bash
# Downloads the Linux NDK, used by WSL. Nothing is installed in the repository.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[ -f "$TOOLCHAIN_FILE" ] && { echo "NDK already present: $NDK"; exit 0; }
zip=$(mktemp --suffix=.zip)
curl -fL --retry 3 -o "$zip" "https://dl.google.com/android/repository/android-ndk-$NDK_VERSION-linux.zip"
unzip -q "$zip" -d "$(dirname "$NDK")"
rm -f "$zip"
echo "NDK installed: $NDK"
