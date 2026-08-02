Pod::Spec.new do |s|
  s.name = 'MiniLynxNotifications'
  s.version = '0.1.0'
  s.summary = 'Local and remote push notifications for Lynx'
  s.homepage = 'https://github.com/amritk/mini/tree/main/packages/mini-lynx-notifications'
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
  s.frameworks = 'UserNotifications', 'UIKit'
end
