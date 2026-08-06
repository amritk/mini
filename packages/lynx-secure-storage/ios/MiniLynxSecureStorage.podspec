Pod::Spec.new do |s|
  s.name = 'MiniLynxSecureStorage'
  s.version = '0.1.0'
  s.summary = 'Keychain-backed encrypted key-value storage for Lynx'
  s.homepage = 'https://github.com/amritk/mini/tree/main/packages/lynx-secure-storage'
  s.license = { :type => 'MIT' }
  s.author = 'amritk'
  # `pod lib lint` validates against the files on disk and never fetches this,
  # but a podspec without a well-formed source fails validation outright — so it
  # names the repository the sources actually live in.
  s.source = { :git => 'https://github.com/amritk/mini.git', :tag => "v#{s.version}" }
  s.source_files = 'src/**/*.{h,m}'
  # 13.0 to match the other native packages here. Nothing in this one needs it —
  # `SecItem*` and the `ThisDeviceOnly` protection classes are far older — but a
  # library that raised the floor of a host app to gain nothing would be a poor
  # trade, and one that lowered it below its siblings would be a second number
  # to reason about.
  s.platform = :ios, '13.0'
  # Pinned to the major the Android half and the `@lynx-js/types` peer are on.
  # The CocoaPods release lags Maven's — 4.0.0 is the newest pod, 4.0.1 the
  # newest AAR — so this is a range rather than a version the two could share.
  s.dependency 'Lynx', '~> 4.0'
  # Security is not one of the frameworks every iOS pod links by default, the
  # way Foundation and UIKit are, so it is named here — the same reason
  # `@amritk/lynx-location` names CoreLocation.
  s.frameworks = 'Security'
end
