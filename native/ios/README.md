# iOS build

The iPhone and iPad app is built on a Mac, or by the `iOS` workflow on a
GitHub macOS runner (`.github/workflows/ios.yml`). It uses the same web layer
(`app/`), the same Subsurface core and the same dependency versions
(`native/env.sh`) as Android.

## What is where

- `native/ios/build-ios.sh` builds Subsurface's core, the compatibility layer,
  the facade and their dependencies into `build/ios/OpenDivesCore.xcframework`,
  for iPhone (arm64) and the simulator (arm64 and x86_64).
- `native/ios/prepare-app.sh` puts the framework, its headers and its assets in
  the plugin (`plugins/opendives-core/ios/`), builds the web layer and runs
  `cap sync ios`.
- `plugins/opendives-core/ios/Plugin/` is the Swift side of the plugin, the
  counterpart of the Kotlin side in `plugins/opendives-core/android/`; its pod
  is `plugins/opendives-core/OpendivesCoreIos.podspec`.
- `app/ios/` is the Capacitor iOS project (icon, launch screen, Info.plist).
- `tests/ios/` runs the round-trip and planner tests in a simulator
  (`run-simulator.sh`; expected round-trip result: 97 passed, 1 known failure,
  `TestDiveSeabearNewFormat.xml`), starts the app (`run-app.sh`), checks the
  offline maps on iPhone and iPad (`run-maps.sh`) and starts the app many times
  (`run-launches.sh`).

## Building on a Mac

```sh
git submodule update --init --recursive
brew install autoconf automake libtool ninja cmake
bash native/ios/build-ios.sh
bash tests/ios/run-simulator.sh
bash native/ios/prepare-app.sh
open app/ios/App/App.xcworkspace
```

## The workflow

It runs on `main` when the native side changes, and by hand (Actions → iOS →
Run workflow) on any branch. The `OpenDives-simulator` artifact is the app for
the simulator, to upload to Appetize. The minimum iOS version, `IOS_MIN` in
`native/ios/env.sh`, follows Capacitor's.
