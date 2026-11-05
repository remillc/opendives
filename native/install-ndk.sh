#!/bin/bash
# Télécharge le NDK Linux, utilisé par WSL. Rien n'est installé dans le dépôt.
set -euo pipefail
source "$(dirname "$0")/env.sh"
[ -f "$TOOLCHAIN_FILE" ] && { echo "NDK déjà présent : $NDK"; exit 0; }
zip=$(mktemp --suffix=.zip)
curl -fL --retry 3 -o "$zip" "https://dl.google.com/android/repository/android-ndk-$NDK_VERSION-linux.zip"
unzip -q "$zip" -d "$(dirname "$NDK")"
rm -f "$zip"
echo "NDK installé : $NDK"
