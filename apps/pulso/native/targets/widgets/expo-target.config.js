// Pulso's home/lock screen widgets and the Control Center control
// (apps/pulso-ios/PulsoWidgets + Shared + Design/Theme.swift, symlinked
// unchanged). They read the snapshot the app writes to the App Group
// (src/widgets) and reach the Mac with the pairing it mirrors to the
// `.shared` Keychain group (modules/pulso-watch WidgetStore).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const app = config.ios.bundleIdentifier;
  return {
    type: "widget",
    name: "PulsoWidgets",
    displayName: config.name,
    bundleIdentifier: ".widgets",
    deploymentTarget: "26.0",
    frameworks: ["AppIntents"],
    // The SwiftUI target's AccentColor (PulsoWidgets/Assets.xcassets).
    colors: { $accent: { color: "#5B5FE6", darkColor: "#8B8FFF" } },
    entitlements: {
      "com.apple.security.application-groups": [`group.${app}`],
      "keychain-access-groups": [`$(AppIdentifierPrefix)${app}.shared`],
    },
  };
};
