#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Builds the core for iOS and packages it:
#   build/ios/OpenDivesCore.xcframework   the core and all its dependencies
#   build/ios/assets/                     SampleDivesV2.ssrf and Subsurface's stylesheets
# The test programs are built for the slice sim-arm64, the one the runner can run.
# usage: native/ios/build-ios.sh [slice...]     (default: every slice)
set -euo pipefail
source "$(dirname "$0")/env.sh"
SLICES=${*:-$ALL_SLICES}
bash "$ROOT/native/ios/build-deps.sh" $SLICES

for S in $SLICES; do
  slice "$S"
  echo "== $S : core"
  B=$OUT/core/$S
  TESTS=OFF
  [ "$S" = sim-arm64 ] && TESTS=ON
  cmake -S "$ROOT/native/ios" -B "$B" -G Ninja -Wno-dev $(cmake_slice_args) \
    -DCMAKE_BUILD_TYPE=Release -DDEPS="$OUT/deps/$S" -DOPENDIVES_TESTS="$TESTS" >/dev/null
  cmake --build "$B" -j"$JOBS"

  # One archive per slice, holding the core and everything it needs.
  D=$OUT/deps/$S/lib
  mkdir -p "$OUT/merged/$S"
  xcrun libtool -static -no_warning_for_no_symbols -o "$OUT/merged/$S/libOpenDivesCore.a" "$B/libopendives.a" \
    "$D/libdivecomputer.a" "$D/libgit2.a" "$D/libmbedtls.a" "$D/libmbedx509.a" "$D/libmbedcrypto.a" \
    "$D/libzip.a" "$D/libxslt.a" "$D/libxml2.a" "$D/libsqlite3.a"
done

rm -rf "$OUT/headers"
mkdir -p "$OUT/assets/xslt" "$OUT/headers/core/libopendives" "$OUT/headers/core/compat"
cp "$SS/dives/SampleDivesV2.ssrf" "$ROOT/core/data/regions.txt" "$OUT/assets/"
cp "$SS"/xslt/*.xsl* "$OUT/assets/xslt/"
# iOS cannot export its trust store for Mbed TLS: Mozilla's list ships with the app.
curl -fsSL --retry 3 -o "$OUT/assets/cacert.pem" https://curl.se/ca/cacert.pem
cp "$ROOT"/core/libopendives/*.h "$OUT/headers/core/libopendives/"
cp "$ROOT/core/compat/bt_transport.h" "$OUT/headers/core/compat/"

# The xcframework needs every slice; a partial build stops here.
for S in $ALL_SLICES; do
  [ -f "$OUT/merged/$S/libOpenDivesCore.a" ] || { echo "slice $S not built: no xcframework"; exit 0; }
done
mkdir -p "$OUT/merged/sim"
xcrun lipo -create "$OUT/merged/sim-arm64/libOpenDivesCore.a" "$OUT/merged/sim-x86_64/libOpenDivesCore.a" \
  -output "$OUT/merged/sim/libOpenDivesCore.a"
rm -rf "$OUT/OpenDivesCore.xcframework"
xcodebuild -create-xcframework \
  -library "$OUT/merged/device-arm64/libOpenDivesCore.a" -headers "$OUT/headers" \
  -library "$OUT/merged/sim/libOpenDivesCore.a" -headers "$OUT/headers" \
  -output "$OUT/OpenDivesCore.xcframework"
ls -l "$OUT"/merged/*/libOpenDivesCore.a
