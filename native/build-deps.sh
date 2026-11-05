#!/bin/bash
# Compile les dépendances du cœur en bibliothèques statiques pour Android :
# libgit2 (sans HTTPS ni SSH), libxml2, libxslt, sqlite3, libzip, libdivecomputer.
# La zlib est celle du NDK. Résultat : build/android/deps/<abi>/{include,lib}
# usage: native/build-deps.sh [abi...]
set -euo pipefail
source "$(dirname "$0")/env.sh"
ABIS=${*:-$ALL_ABIS}
SRC=$OUT/src
mkdir -p "$SRC"

clone() { # nom url tag
  [ -d "$SRC/$1/.git" ] || git clone -q --depth 1 --branch "$3" "$2" "$SRC/$1"
}
clone libgit2 https://github.com/libgit2/libgit2.git "$LIBGIT2_TAG"
clone libxml2 https://github.com/GNOME/libxml2.git "$LIBXML2_TAG"
clone libxslt https://github.com/GNOME/libxslt.git "$LIBXSLT_TAG"
clone libzip https://github.com/nih-at/libzip.git "$LIBZIP_TAG"
if [ ! -f "$SRC/sqlite/sqlite3.c" ]; then
  mkdir -p "$SRC/sqlite"
  curl -fL --retry 3 "https://sqlite.org/$SQLITE_YEAR/sqlite-autoconf-$SQLITE_VERSION.tar.gz" |
    tar xz --strip-components=1 -C "$SRC/sqlite"
fi

for ABI in $ABIS; do
  P=$OUT/deps/$ABI
  W=$OUT/work/$ABI
  mkdir -p "$P/lib" "$P/include" "$W"
  cm() { # nom [options cmake...]
    local name=$1; shift
    [ -f "$W/$name.done" ] && return 0
    echo "== $ABI : $name"
    cmake -S "$SRC/$name" -B "$W/$name" -G Ninja -Wno-dev \
      -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN_FILE" -DANDROID_ABI="$ABI" -DANDROID_PLATFORM="android-$ANDROID_API" \
      -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$P" -DCMAKE_INSTALL_LIBDIR=lib \
      -DCMAKE_FIND_ROOT_PATH="$P" -DCMAKE_PREFIX_PATH="$P" -DBUILD_SHARED_LIBS=OFF \
      -DCMAKE_POSITION_INDEPENDENT_CODE=ON "$@" >"$W/$name.log" 2>&1 || { tail -30 "$W/$name.log"; exit 1; }
    cmake --build "$W/$name" --target install -j"$JOBS" >>"$W/$name.log" 2>&1 || { tail -30 "$W/$name.log"; exit 1; }
    touch "$W/$name.done"
  }

  # libgit2 impose -std=c90, où les en-têtes du NDK ne connaissent pas « inline ».
  cm libgit2 -DCMAKE_C_FLAGS=-Dinline=__inline__ -DUSE_HTTPS=OFF -DUSE_SSH=OFF -DBUILD_TESTS=OFF -DBUILD_CLI=OFF -DBUILD_EXAMPLES=OFF \
    -DUSE_BUNDLED_ZLIB=OFF -DREGEX_BACKEND=builtin -DUSE_HTTP_PARSER=builtin -DUSE_NTLMCLIENT=OFF -DUSE_GSSAPI=OFF
  cm libxml2 -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ICU=OFF -DLIBXML2_WITH_LZMA=OFF \
    -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_DOCS=OFF
  cm libxslt -DLIBXSLT_WITH_PYTHON=OFF -DLIBXSLT_WITH_CRYPTO=OFF -DLIBXSLT_WITH_MODULES=OFF \
    -DLIBXSLT_WITH_PROFILER=OFF -DLIBXSLT_WITH_PROGRAMS=OFF -DLIBXSLT_WITH_TESTS=OFF
  cm libzip -DENABLE_BZIP2=OFF -DENABLE_LZMA=OFF -DENABLE_GNUTLS=OFF -DENABLE_MBEDTLS=OFF -DENABLE_OPENSSL=OFF \
    -DENABLE_COMMONCRYPTO=OFF -DENABLE_WINDOWS_CRYPTO=OFF -DBUILD_TOOLS=OFF -DBUILD_REGRESS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_DOC=OFF

  TC=$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin
  case $ABI in
    arm64-v8a) TRIPLE=aarch64-linux-android ;;
    x86_64) TRIPLE=x86_64-linux-android ;;
    *) echo "ABI inconnue : $ABI"; exit 1 ;;
  esac
  CC_ABI="$TC/$TRIPLE$ANDROID_API-clang"

  if [ ! -f "$P/lib/libsqlite3.a" ]; then
    echo "== $ABI : sqlite3"
    "$CC_ABI" -O2 -fPIC -DSQLITE_OMIT_LOAD_EXTENSION -c "$SRC/sqlite/sqlite3.c" -o "$W/sqlite3.o"
    "$TC/llvm-ar" rcs "$P/lib/libsqlite3.a" "$W/sqlite3.o"
    cp "$SRC/sqlite/sqlite3.h" "$P/include/"
  fi

  if [ ! -f "$P/lib/libdivecomputer.a" ]; then
    echo "== $ABI : libdivecomputer"
    rm -rf "$W/libdc"; cp -r "$SS/libdivecomputer" "$W/libdc"
    (cd "$W/libdc" && autoreconf --install --force >/dev/null 2>&1 &&
     ./configure --host="$TRIPLE" --prefix="$P" --disable-shared --enable-static --with-pic \
       --without-libusb --without-hidapi --without-bluez --disable-examples \
       CC="$CC_ABI" AR="$TC/llvm-ar" RANLIB="$TC/llvm-ranlib" STRIP="$TC/llvm-strip" >"$W/libdc.log" 2>&1 &&
     make -j"$JOBS" >>"$W/libdc.log" 2>&1 && make install >>"$W/libdc.log" 2>&1) ||
      { tail -30 "$W/libdc.log"; exit 1; }
  fi
done
echo "dépendances prêtes dans $OUT/deps"
