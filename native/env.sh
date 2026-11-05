# Common settings for the Android build. To be sourced, under Linux or WSL.
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SS=$ROOT/third_party/subsurface
OUT=$ROOT/build/android
ANDROID_API=24
NDK_VERSION=r28c
NDK=${ANDROID_NDK_HOME:-$HOME/android-ndk-$NDK_VERSION}
TOOLCHAIN_FILE=$NDK/build/cmake/android.toolchain.cmake
ALL_ABIS="arm64-v8a x86_64"
JOBS=$(nproc 2>/dev/null || echo 4)

# Same versions as Subsurface (scripts/get-dep-lib.sh), except zlib, provided by the NDK.
LIBGIT2_TAG=v1.8.1
LIBXML2_TAG=v2.15.1
LIBXSLT_TAG=v1.1.45
LIBZIP_TAG=rel-1-5-1
OPENSSL_TAG=openssl-3.4.4   # the one Subsurface uses for Android
SQLITE_VERSION=3190200
SQLITE_YEAR=2017

[ -f "$SS/core/dive.cpp" ] || { echo "missing submodule: git submodule update --init --recursive"; exit 1; }
