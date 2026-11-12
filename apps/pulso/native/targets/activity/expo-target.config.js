// The Live Activity (lock screen + Dynamic Island) of a strength session:
// apps/pulso-ios/PulsoActivity + TrainingActivityAttributes, symlinked unchanged.
// The app starts and updates it through modules/pulso-watch (LiveActivity).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "PulsoActivity",
  displayName: config.name,
  bundleIdentifier: ".activity",
  deploymentTarget: "26.0",
  colors: { $accent: "#A07CFF", $widgetBackground: "#000000" },
});
