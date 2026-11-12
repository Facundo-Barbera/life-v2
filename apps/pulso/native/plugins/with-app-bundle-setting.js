// Sets PULSO_APP_BUNDLE_ID (the app's bundle id of this variant) on the Xcode
// project, so every target inherits it: the widget extension's static
// Info.plist names the App Group and Keychain group from it, as the SwiftUI
// project's did (apps/pulso-ios/Config/PulsoWidgets.plist).
const { withXcodeProject } = require("expo/config-plugins");

module.exports = (config) =>
  withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const root = project.getFirstProject().firstProject;
    const lists = project.pbxXCConfigurationList();
    const configs = project.pbxXCBuildConfigurationSection();
    for (const { value } of lists[root.buildConfigurationList].buildConfigurations) {
      configs[value].buildSettings.PULSO_APP_BUNDLE_ID = mod.ios.bundleIdentifier;
    }
    return mod;
  });
