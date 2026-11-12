// Pulso's complication (apps/pulso-ios/PulsoWatchWidgets, symlinked unchanged), embedded in the Watch app.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "watch-widget",
  name: "PulsoWatchWidgets",
  displayName: config.name,
  bundleIdentifier: ".watchkitapp.widgets",
  deploymentTarget: "26.0",
  colors: { $accent: "#A07CFF", $widgetBackground: "#000000" },
});
