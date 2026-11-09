#!/bin/bash
# Builds the planner tests for Android with the NDK (same sources and flags as
# libopendives.so): build/android/tests/<abi>/{plan_test,plan_oracle}.
# Needs the dependencies of native/build-android.sh (build/android/deps/<abi>),
# so run native/build-android.sh once first (or at least native/build-deps.sh).
# usage: tests/android/build.sh [abi...]     (default: x86_64)
set -euo pipefail
source "$(dirname "$0")/../../native/env.sh"
ABIS=${*:-x86_64}
[ -f "$TOOLCHAIN_FILE" ] || { echo "NDK not found: run native/install-ndk.sh"; exit 1; }
for ABI in $ABIS; do
  [ -d "$OUT/deps/$ABI/lib" ] || { echo "missing $OUT/deps/$ABI: run native/build-deps.sh $ABI"; exit 1; }
  echo "== $ABI : planner tests"
  B=$OUT/tests/$ABI
  cmake -S "$ROOT/tests/android" -B "$B" -G Ninja -Wno-dev \
    -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" -DANDROID_ABI="$ABI" -DANDROID_PLATFORM="android-$ANDROID_API" \
    -DANDROID_STL=c++_static -DCMAKE_BUILD_TYPE=Release -DDEPS="$OUT/deps/$ABI" >/dev/null
  cmake --build "$B" -j"$JOBS"
  ls -l "$B/plan_test" "$B/plan_oracle"
done
