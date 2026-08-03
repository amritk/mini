Pod::Spec.new do |s|
  s.name = 'MiniLynxLocation'
  s.version = '0.1.0'
  s.summary = 'Device location for Lynx'
  s.homepage = 'https://github.com/amritk/mini/tree/main/packages/lynx-location'
  s.license = { :type => 'MIT' }
  s.author = 'amritk'
  # `pod lib lint` validates against the files on disk and never fetches this,
  # but a podspec without a well-formed source fails validation outright — so it
  # names the repository the sources actually live in.
  s.source = { :git => 'https://github.com/amritk/mini.git', :tag => "v#{s.version}" }
  s.source_files = 'src/**/*.{h,m}'
  s.platform = :ios, '13.0'
  # Pinned to the major the Android half and the `@lynx-js/types` peer are on.
  # The CocoaPods release lags Maven's — 4.0.0 is the newest pod, 4.0.1 the
  # newest AAR — so this is a range rather than a version the two could share.
  s.dependency 'Lynx', '~> 4.0'
  # Contacts is here only for `CNPostalAddressFormatter`, which turns a
  # `CLPlacemark`'s postal address into the string that country would write. It
  # reaches no contact store and needs no permission — the formatter is pure
  # formatting — but it does live in that framework.
  s.frameworks = 'CoreLocation', 'Contacts'
end
