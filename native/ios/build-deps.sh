#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Builds the core dependencies as static libraries for iOS, with the options of
# OpenDives' native/build-deps.sh (Android): Mbed TLS, libgit2 (HTTPS through
# Mbed TLS, no SSH), libxml2, libxslt, sqlite3, libzip, libdivecomputer.
# zlib and iconv come from the iOS SDK. Output: build/ios/deps/<slice>/{include,lib}
# usage: native/ios/build-deps.sh [slice...]
set -euo pipefail
source "$(dirname "$0")/env.sh"
SLICES=${*:-$ALL_SLICES}
SRC=$OUT/src
mkdir -p "$SRC"

clone() { # name url tag
  [ -d "$SRC/$1/.git" ] || git clone -q --depth 1 --branch "$3" "$2" "$SRC/$1"
}
[ -d "$SRC/mbedtls/.git" ] || git clone -q --depth 1 --recurse-submodules --shallow-submodules --branch "$MBEDTLS_TAG" https://github.com/Mbed-TLS/mbedtls.git "$SRC/mbedtls"
# Same configuration as Android: threading on, TLS up to 1.2 (see OpenDives'
# native/build-deps.sh). perl, because BSD sed has neither -i alone nor \b.
perl -pi -e 's{^//(#define MBEDTLS_THREADING_(C|PTHREAD))\b}{$1}; s{^(#define MBEDTLS_SSL_(PROTO_TLS1_3|TLS1_3_[A-Z0-9_]+))\b}{//$1}' "$SRC/mbedtls/include/mbedtls/mbedtls_config.h"
clone libgit2 https://github.com/libgit2/libgit2.git "$LIBGIT2_TAG"
clone libxml2 https://github.com/GNOME/libxml2.git "$LIBXML2_TAG"
clone libxslt https://github.com/GNOME/libxslt.git "$LIBXSLT_TAG"
clone libzip https://github.com/nih-at/libzip.git "$LIBZIP_TAG"
# This version has no option to skip its programs, which cannot be installed
# as iOS bundles. In our clone only, built for the library alone.
perl -pi -e 's/^ADD_SUBDIRECTORY\((src|regress|examples)\)\s*$//' "$SRC/libzip/CMakeLists.txt"
if [ ! -f "$SRC/sqlite/sqlite3.c" ]; then
  mkdir -p "$SRC/sqlite"
  curl -fL --retry 3 "https://sqlite.org/$SQLITE_YEAR/sqlite-autoconf-$SQLITE_VERSION.tar.gz" |
    tar xz --strip-components=1 -C "$SRC/sqlite"
fi

for S in $SLICES; do
  slice "$S"
  P=$OUT/deps/$S
  W=$OUT/work/$S
  mkdir -p "$P/lib" "$P/include" "$W"
  cm() { # name [cmake options...] — rebuilt if the options change
    local name=$1; shift
    [ -f "$W/$name.done" ] && [ "$(cat "$W/$name.done")" = "$*" ] && return 0
    rm -rf "$W/$name"
    echo "== $S : $name"
    cmake -S "$SRC/$name" -B "$W/$name" -G Ninja -Wno-dev $(cmake_slice_args) \
      -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$P" -DCMAKE_INSTALL_LIBDIR=lib \
      -DCMAKE_FIND_ROOT_PATH="$P" -DCMAKE_PREFIX_PATH="$P" -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON "$@" >"$W/$name.log" 2>&1 || { tail -40 "$W/$name.log"; exit 1; }
    cmake --build "$W/$name" --target install -j"$JOBS" >>"$W/$name.log" 2>&1 || { tail -40 "$W/$name.log"; exit 1; }
    echo "$*" > "$W/$name.done"
    rm -rf "$W/$name"
  }

  cm mbedtls -DENABLE_PROGRAMS=OFF -DENABLE_TESTING=OFF -DMBEDTLS_FATAL_WARNINGS=OFF -DGEN_FILES=OFF -DUSE_SHARED_MBEDTLS_LIBRARY=OFF
  cm libgit2 -DUSE_HTTPS=mbedTLS -DUSE_SHA1=CollisionDetection -DUSE_SHA256=Builtin \
    -DUSE_SSH=OFF -DBUILD_TESTS=OFF -DBUILD_CLI=OFF -DBUILD_EXAMPLES=OFF \
    -DUSE_BUNDLED_ZLIB=OFF -DREGEX_BACKEND=builtin -DUSE_HTTP_PARSER=builtin -DUSE_NTLMCLIENT=OFF -DUSE_GSSAPI=OFF
  cm libxml2 -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ICU=OFF -DLIBXML2_WITH_LZMA=OFF \
    -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_DOCS=OFF
  cm libxslt -DLIBXSLT_WITH_PYTHON=OFF -DLIBXSLT_WITH_CRYPTO=OFF -DLIBXSLT_WITH_MODULES=OFF \
    -DLIBXSLT_WITH_PROFILER=OFF -DLIBXSLT_WITH_PROGRAMS=OFF -DLIBXSLT_WITH_TESTS=OFF
  # The SDK has bzip2, the NDK has not: without it, as on Android.
  cm libzip -DCMAKE_DISABLE_FIND_PACKAGE_BZip2=ON -DENABLE_GNUTLS=OFF -DENABLE_OPENSSL=OFF -DENABLE_COMMONCRYPTO=OFF

  CLANG=$(xcrun --sdk "$SDK" -f clang)
  AR=$(xcrun --sdk "$SDK" -f ar)
  RANLIB=$(xcrun --sdk "$SDK" -f ranlib)
  CFLAGS_SLICE="-target $TARGET -isysroot $SYSROOT -O2 -fPIC"

  if [ ! -f "$P/lib/libsqlite3.a" ]; then
    echo "== $S : sqlite3"
    # The locking styles call gethostuuid, which iOS does not offer.
    "$CLANG" $CFLAGS_SLICE -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_ENABLE_LOCKING_STYLE=0 -c "$SRC/sqlite/sqlite3.c" -o "$W/sqlite3.o"
    "$AR" rcs "$P/lib/libsqlite3.a" "$W/sqlite3.o"
    cp "$SRC/sqlite/sqlite3.h" "$P/include/"
  fi

  if [ ! -f "$P/lib/libdivecomputer.a" ]; then
    echo "== $S : libdivecomputer"
    # --build differs from --host on purpose: configure must not try to run
    # what it compiles, even when the slice has the architecture of the runner.
    case $ARCH in
      arm64) HOST=aarch64-apple-darwin; BUILD=x86_64-apple-darwin ;;
      x86_64) HOST=x86_64-apple-darwin; BUILD=aarch64-apple-darwin ;;
    esac
    rm -rf "$W/libdc"; cp -R "$SS/libdivecomputer" "$W/libdc"
    (cd "$W/libdc" && autoreconf --install --force >/dev/null 2>&1 &&
     ./configure --build="$BUILD" --host="$HOST" --prefix="$P" --disable-shared --enable-static --with-pic \
       --without-libusb --without-hidapi --without-bluez --disable-examples \
       CC="$CLANG" CFLAGS="$CFLAGS_SLICE" AR="$AR" RANLIB="$RANLIB" >"$W/libdc.log" 2>&1 &&
     make -j"$JOBS" >>"$W/libdc.log" 2>&1 && make install >>"$W/libdc.log" 2>&1) ||
      { tail -40 "$W/libdc.log"; exit 1; }
    rm -rf "$W/libdc"
  fi
done
echo "dependencies ready in $OUT/deps"
