#!/bin/bash
# Compile libopendives.so pour Android et prépare ce que Gradle embarque :
#   build/android/jniLibs/<abi>/libopendives.so
#   build/android/assets/SampleDivesV2.ssrf
# usage: native/build-android.sh [abi...]     (par défaut : arm64-v8a x86_64)
set -euo pipefail
source "$(dirname "$0")/env.sh"
ABIS=${*:-$ALL_ABIS}
[ -f "$TOOLCHAIN_FILE" ] || { echo "NDK introuvable : lancez native/install-ndk.sh"; exit 1; }
"$ROOT/native/build-deps.sh" $ABIS

for ABI in $ABIS; do
  echo "== $ABI : libopendives"
  B=$OUT/core/$ABI
  cmake -S "$ROOT/native" -B "$B" -G Ninja -Wno-dev \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" -DANDROID_ABI="$ABI" -DANDROID_PLATFORM="android-$ANDROID_API" \
    -DANDROID_STL=c++_static -DCMAKE_BUILD_TYPE=Release -DDEPS="$OUT/deps/$ABI" >/dev/null
  cmake --build "$B" -j"$JOBS"
  mkdir -p "$OUT/jniLibs/$ABI"
  "$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-strip" --strip-unneeded \
    -o "$OUT/jniLibs/$ABI/libopendives.so" "$B/libopendives.so"
done

mkdir -p "$OUT/assets"
cp "$SS/dives/SampleDivesV2.ssrf" "$OUT/assets/"
ls -l "$OUT"/jniLibs/*/libopendives.so
