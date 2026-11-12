import type { ConfigContext, ExpoConfig } from "expo/config";

// Pulso on Expo (life-v2: Supabase instead of the Mac engine). The bundle ids are the SwiftUI app's (apps/pulso-ios), so the
// TestFlight record, HealthKit grants, App Group and Keychain group carry over:
// a dev build is `com.facundo.pulso.dev` ("Pulso Dev"), `PULSO_VARIANT=release`
// is `com.facundo.pulso` (what scripts/ios-release.ts prebuilds before archiving).
// `ios/` is generated (CNG): never edit it, change this file or a plugin.
const release = process.env.PULSO_VARIANT === "release";
const bundleIdentifier = release ? "com.facundo.pulso" : "com.facundo.pulso.dev";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Also the Xcode project and scheme ("Pulso"), the same in both variants; the home screen name differs.
  name: "Pulso",
  slug: "pulso",
  scheme: "pulso",
  version: "0.1.0",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier,
    appleTeamId: "MM74W7WGAM",
    supportsTablet: false,
    // The release pipeline passes each upload's build number (it must match the Watch app's).
    buildNumber: process.env.LIFE_BUILD_NUMBER ?? "1",
    entitlements: {
      "com.apple.developer.healthkit": true,
      "com.apple.developer.healthkit.access": [],
      "com.apple.security.application-groups": [`group.${bundleIdentifier}`],
      "keychain-access-groups": [`$(AppIdentifierPrefix)${bundleIdentifier}`, `$(AppIdentifierPrefix)${bundleIdentifier}.shared`],
    },
    infoPlist: {
      CFBundleDevelopmentRegion: "es",
      CFBundleDisplayName: release ? "Pulso" : "Pulso Dev",
      PulsoAppGroup: `group.${bundleIdentifier}`,
      PulsoKeychainGroup: `$(AppIdentifierPrefix)${bundleIdentifier}.shared`,
      NSSupportsLiveActivities: true,
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription: "Pulso usa la cámara para escanear códigos de barras y el QR de InBody.",
      NSFaceIDUsageDescription: "Pulso usa Face ID para proteger tus datos de salud.",
      UISupportedInterfaceOrientations: ["UIInterfaceOrientationPortrait"],
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-status-bar",
    [
      "@kingstinct/react-native-healthkit",
      {
        NSHealthShareUsageDescription:
          "Pulso lee de Salud tus entrenamientos, actividad, sueño, frecuencia cardíaca, peso, composición corporal y medicamentos para guardarlos en tu cuenta de Pulso y calcular tu recuperación y tus proyecciones.",
        NSHealthUpdateUsageDescription:
          "Pulso guarda en Salud tus sesiones de fuerza y de cardio como entrenamientos (con distancia y calorías cuando las anotas) y el agua que registras.",
        background: false,
      },
    ],
    // Barcodes and the InBody QR (Dieta, Cuerpo); no video, so no microphone.
    ["expo-camera", { recordAudioAndroid: false, microphonePermission: false }],
    ["expo-build-properties",{ ios: { deploymentTarget: "26.0" } }],
    // The Swift targets in targets/ (Watch app, its complication, the Live Activity, the widgets).
    "@bacons/apple-targets",
    "./plugins/with-app-bundle-setting",
  ],
  experiments: { typedRoutes: true },
});
