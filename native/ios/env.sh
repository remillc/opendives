# SPDX-License-Identifier: GPL-2.0
# Common settings for the iOS build. To be sourced, on macOS with Xcode.
# ROOT, SS and the dependency versions come from the Android build's
# settings, so that iOS and Android always build the same code.
source "$(dirname "${BASH_SOURCE[0]}")/../env.sh"

OUT=$ROOT/build/ios
JOBS=$(sysctl -n hw.ncpu)
IOS_MIN=14.0            # Capacitor 7's minimum
ALL_SLICES="device-arm64 sim-arm64 sim-x86_64"

# Homebrew's libtool installs its tools under a "g" prefix.
command -v glibtoolize >/dev/null 2>&1 && export LIBTOOLIZE=glibtoolize

slice() { # name: sets SDK, ARCH, TARGET and SYSROOT
  case $1 in
    device-arm64) SDK=iphoneos;        ARCH=arm64;  TARGET=arm64-apple-ios$IOS_MIN ;;
    sim-arm64)    SDK=iphonesimulator; ARCH=arm64;  TARGET=arm64-apple-ios$IOS_MIN-simulator ;;
    sim-x86_64)   SDK=iphonesimulator; ARCH=x86_64; TARGET=x86_64-apple-ios$IOS_MIN-simulator ;;
    *) echo "unknown slice: $1"; exit 1 ;;
  esac
  SYSROOT=$(xcrun --sdk "$SDK" --show-sdk-path)
}

# An iPhone on the most recent iOS runtime installed: its UDID.
pick_simulator() {
  xcrun simctl list devices available -j | python3 -c '
import json, re, sys
devices = json.load(sys.stdin)["devices"]
runtimes = [k for k in devices if ".iOS-" in k and any("iPhone" in d["name"] for d in devices[k])]
runtime = max(runtimes, key=lambda k: [int(n) for n in re.findall(r"\d+", k.rsplit(".iOS-", 1)[1])])
print(next(d["udid"] for d in devices[runtime] if "iPhone" in d["name"]))
'
}

# Options that make CMake target a slice (call slice first).
cmake_slice_args() {
  echo -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT="$SDK" -DCMAKE_OSX_ARCHITECTURES="$ARCH" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$IOS_MIN" -DCMAKE_POLICY_VERSION_MINIMUM=3.5
}
