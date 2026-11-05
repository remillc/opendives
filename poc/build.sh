#!/bin/bash
# OpenDives POC — builds Subsurface's core (unmodified, without Qt) and the
# round-trip test program. Linux / WSL. Needs: g++ (C++20), autotools,
# pkg-config, libgit2, libxml2, libxslt, libzip, sqlite3, zlib.
#   Debian/Ubuntu: apt install build-essential autoconf automake libtool \
#                  pkg-config libgit2-dev libxml2-dev libxslt1-dev libzip-dev \
#                  libsqlite3-dev zlib1g-dev
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
  echo "$ROOT/tests/roundtrip.cpp"; echo "$ROOT/tests/facade.cpp"
  echo "$ROOT/core/libopendives/opendives.cpp"; } > "$B/sources.txt"

export FLAGS B
xargs -P"$JOBS" -I{} bash -c 'o="$B/obj/$(basename {} .cpp).o"; [ "$o" -nt {} ] || g++ $FLAGS -c {} -o "$o"' < "$B/sources.txt"

# 4. Link.
OBJS=$(ls "$B"/obj/*.o | grep -Ev '/(roundtrip|facade|opendives)\.o$')
LIBS="$B/libdc/lib/libdivecomputer.a $(pkg-config --libs libgit2 libxml-2.0 libxslt libzip sqlite3) -lz -lm"
g++ $OBJS "$B/obj/roundtrip.o" -o "$B/roundtrip" $LIBS
g++ $OBJS "$B/obj/opendives.o" "$B/obj/facade.o" -o "$B/facade" $LIBS
echo "built $B/roundtrip $B/facade"
