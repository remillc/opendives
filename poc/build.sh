#!/bin/bash
# OpenDives POC — builds Subsurface's core (unmodified, without Qt) and the
# round-trip test program. Linux / WSL. Needs: g++ (C++20), autotools,
# pkg-config, libgit2, libxml2, libxslt, libzip, sqlite3, zlib.
#   Debian/Ubuntu: apt install build-essential autoconf automake libtool \
#                  pkg-config libgit2-dev libxml2-dev libxslt1-dev libzip-dev \
#                  libsqlite3-dev zlib1g-dev libssl-dev
# usage: poc/build.sh [build-dir]     (default: build/poc)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SS=$ROOT/third_party/subsurface
B=${1:-$ROOT/build/poc}
COMPAT=$ROOT/core/compat
JOBS=$(nproc 2>/dev/null || echo 4)

[ -f "$SS/core/dive.cpp" ] || { echo "missing $SS: run  git submodule update --init --recursive"; exit 1; }
mkdir -p "$B/obj" "$B/gen"

# 1. libdivecomputer (Subsurface fork, pinned by Subsurface itself), static.
if [ ! -f "$B/libdc/lib/libdivecomputer.a" ]; then
  rm -rf "$B/libdc-src"; cp -r "$SS/libdivecomputer" "$B/libdc-src"
  (cd "$B/libdc-src" && autoreconf --install --force >/dev/null 2>&1 &&
   ./configure --prefix="$B/libdc" --disable-shared --enable-static \
     --without-libusb --without-hidapi --without-bluez --disable-examples >/dev/null &&
   make -j"$JOBS" >/dev/null && make install >/dev/null)
fi

# 2. Generated headers.
printf '#define SUBSURFACE_SOURCE "%s"\n' "$SS" > "$B/gen/build-defs.h"

# 3. Subsurface core files, compiled as they are.
# The list is shared with native/CMakeLists.txt (Android build).
CORE=$(cat "$COMPAT/core-files.txt")

FLAGS="-std=c++20 -O1 -w
 -iquote $COMPAT/shadow -I$COMPAT/qtshim -I$COMPAT/gen -I$B/gen
 -I$ROOT -I$SS -I$SS/libdivecomputer/include -I$B/libdc/include
 -include $B/gen/build-defs.h
 $(pkg-config --cflags libgit2 libxml-2.0 libxslt libzip sqlite3)"

{ for f in $CORE; do echo "$SS/core/$f.cpp"; done
  echo "$COMPAT/qthelper_compat.cpp"; echo "$COMPAT/notifier_compat.cpp"
  echo "$COMPAT/cloud_compat.cpp"; echo "$COMPAT/https_openssl.cpp"
  echo "$ROOT/tests/roundtrip.cpp"; echo "$ROOT/tests/facade.cpp"; echo "$ROOT/tests/cloud.cpp"
  echo "$ROOT/tests/edit_roundtrip.cpp"; echo "$ROOT/tests/cloud_write.cpp"
  echo "$ROOT/tests/regions_test.cpp"; echo "$ROOT/tests/tools_test.cpp"; echo "$ROOT/tests/plan_test.cpp"
  echo "$ROOT/core/libopendives/opendives.cpp"; echo "$ROOT/core/libopendives/edit.cpp"
  echo "$ROOT/core/libopendives/regions.cpp"; echo "$ROOT/core/libopendives/tools.cpp"
  echo "$ROOT/core/libopendives/settings.cpp"; echo "$ROOT/core/libopendives/plan.cpp"
  echo "$ROOT/core/libopendives/filter.cpp"; echo "$ROOT/core/libopendives/stats.cpp"
  echo "$ROOT/tests/stats_test.cpp"; } > "$B/sources.txt"

export FLAGS B
xargs -P"$JOBS" -I{} bash -c 'o="$B/obj/$(basename {} .cpp).o"; [ "$o" -nt {} ] || g++ $FLAGS -c {} -o "$o"' < "$B/sources.txt"

# 4. Link.
OBJS=$(ls "$B"/obj/*.o | grep -Ev '/(roundtrip|facade|cloud|edit_roundtrip|cloud_write|regions_test|tools_test|plan_test|stats_test|opendives|edit|regions|tools|settings|plan|filter|stats)[.]o$')
FACADE="$B/obj/opendives.o $B/obj/edit.o $B/obj/regions.o $B/obj/tools.o $B/obj/settings.o $B/obj/plan.o $B/obj/filter.o $B/obj/stats.o"
LIBS="$B/libdc/lib/libdivecomputer.a $(pkg-config --libs libgit2 libxml-2.0 libxslt libzip sqlite3) -lssl -lcrypto -lz -lm"
g++ $OBJS $FACADE "$B/obj/roundtrip.o" -o "$B/roundtrip" $LIBS
g++ $OBJS $FACADE "$B/obj/facade.o" -o "$B/facade" $LIBS
g++ $OBJS $FACADE "$B/obj/cloud.o" -o "$B/cloud" $LIBS
g++ $OBJS $FACADE "$B/obj/edit_roundtrip.o" -o "$B/edit-roundtrip" $LIBS
g++ $OBJS $FACADE "$B/obj/cloud_write.o" -o "$B/cloud-write" $LIBS
g++ "$B/obj/regions.o" "$B/obj/regions_test.o" -o "$B/regions"
g++ $OBJS $FACADE "$B/obj/tools_test.o" -o "$B/tools" $LIBS
g++ $OBJS $FACADE "$B/obj/plan_test.o" -o "$B/plan" $LIBS
g++ $OBJS $FACADE "$B/obj/stats_test.o" -o "$B/stats" $LIBS
echo "built $B/stats $B/plan $B/regions $B/tools $B/roundtrip $B/facade $B/cloud $B/edit-roundtrip $B/cloud-write"
