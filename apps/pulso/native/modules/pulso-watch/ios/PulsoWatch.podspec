Pod::Spec.new do |s|
  s.name           = 'PulsoWatch'
  s.version        = '0.1.0'
  s.summary        = 'Pulso: the phone side of the Watch (WatchConnectivity, mirrored workout) and the Live Activity.'
  s.author         = 'facundo-barbera'
  s.homepage       = 'https://bixku.com'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '26.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'WatchConnectivity', 'HealthKit', 'ActivityKit', 'WidgetKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files   = '**/*.swift'
end
