Pod::Spec.new do |s|
  s.name = 'OpendivesCore'
  s.version = '0.0.0'
  s.summary = 'The OpenDives core plugin, iOS side'
  s.license = { :type => 'GPL-2.0-only' }
  s.homepage = 'https://github.com/remillc/opendives'
  s.author = 'Christian Rémillard'
  s.source = { :git => 'https://github.com/remillc/opendives.git' }
  s.ios.deployment_target = '14.0'
  s.swift_version = '5.1'
  s.dependency 'Capacitor'

  s.source_files = 'ios/Plugin/**/*.{swift,h,m,mm}'
  s.public_header_files = 'ios/Plugin/OpenDivesNative.h', 'ios/Plugin/BluetoothScan.h'
  s.resources = 'ios/Resources/*'

  # Put in place by native/ios/prepare-app.sh.
  s.vendored_frameworks = 'ios/OpenDivesCore.xcframework'
  s.frameworks = 'CoreBluetooth', 'BackgroundTasks', 'Network'
  s.libraries = 'z', 'iconv', 'c++'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/ios/include"'
  }
end
