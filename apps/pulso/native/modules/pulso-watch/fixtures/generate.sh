#!/usr/bin/env bash
# Regenerates src/swift-fixtures.json from the REAL Swift message types
# (swift/WatchShared + the session files the Watch compiles, vendored from the
# old apps/pulso-ios into apps/pulso/native/swift), so the
# TypeScript codec is tested against what the Watch actually sends and reads.
# macOS only; needs Xcode's swiftc. Not part of `bun run test` (no Swift there).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
ios="$here/../../../swift"
training="$ios/Pulso/Features/Training"
out="$(mktemp -d)"
xcrun swiftc -o "$out/gen" "$here/main.swift" \
  "$ios/WatchShared/SessionSync.swift" "$ios/WatchShared/WorkoutLink.swift" \
  "$training/TrainingModels.swift" "$training/LiveSessionState.swift" "$training/WeightUnit.swift" \
  "$training/Superset.swift" "$training/TrainingText.swift" "$training/SetDrop.swift" "$training/Live/CardioClock.swift"
"$out/gen" > "$here/../src/swift-fixtures.json"
rm -rf "$out"
echo "wrote src/swift-fixtures.json"
