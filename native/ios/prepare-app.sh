#!/bin/bash
# SPDX-License-Identifier: GPL-2.0
# Gives the plugin what native/ios/build-ios.sh produced, builds OpenDives' web
# layer and generates the Xcode workspace.
# usage: native/ios/prepare-app.sh     (after native/ios/build-ios.sh)
set -euo pipefail
source "$(dirname "$0")/env.sh"

P=$ROOT/plugins/opendives-core/ios
rm -rf "$P/OpenDivesCore.xcframework" "$P/include" "$P/Resources"
cp -R "$OUT/OpenDivesCore.xcframework" "$P/"
cp -R "$OUT/headers" "$P/include"
cp -R "$OUT/assets" "$P/Resources"

cd "$ROOT/app"
npm ci --no-audit --no-fund
npm run ios:sync

# The version shown and sent (User-Agent) is the app's, from app/package.json.
VERSION=$(node -p "require('./package.json').version")
perl -pi -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/" ios/App/App.xcodeproj/project.pbxproj
echo "app version $VERSION"
