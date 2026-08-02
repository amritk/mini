Pod::Spec.new do |s|
  s.name = 'MiniLynxNotifications'
  s.version = '0.1.0'
  s.summary = 'Local and remote push notifications for Lynx'
  s.homepage = 'https://github.com/amritk/mini/tree/main/packages/mini-lynx-notifications'
  s.license = { :type => 'MIT' }
  s.author = 'amritk'
  s.source = { :path => '..' }
  s.source_files = 'src/**/*.{h,m}'
  s.platform = :ios, '13.0'
  s.dependency 'Lynx'
  s.frameworks = 'UserNotifications', 'UIKit'
end
