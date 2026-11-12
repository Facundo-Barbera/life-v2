// The Watch app: apps/pulso-ios/PulsoWatch + WatchShared + the session files it
// shares with the phone, symlinked here UNCHANGED (the SwiftUI app keeps them).
// It records the workout and talks to the phone over WatchConnectivity; the
// phone's side is modules/pulso-watch.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch",
  name: "PulsoWatch",
  displayName: config.name,
  bundleIdentifier: ".watchkitapp",
  deploymentTarget: "26.0",
  icon: "../../../pulso-ios/PulsoWatch/Assets.xcassets/AppIcon.appiconset/AppIcon.png",
  colors: { $accent: "#A07CFF" },
  entitlements: {
    "com.apple.developer.healthkit": true,
    "com.apple.developer.healthkit.access": [],
  },
});
