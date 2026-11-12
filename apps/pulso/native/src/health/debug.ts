import { saveCategorySample, saveQuantitySample, saveWorkoutSample } from "@kingstinct/react-native-healthkit";
import { askHealth } from "./access";

/**
 * Debug builds only (Sistema): writes a few clearly fake samples into the
 * simulator's Salud so the sync has something to send. Never on a device.
 */
export async function addSampleHealthData(now = new Date()): Promise<void> {
  if (!__DEV__) return;
  await askHealth({
    toShare: [
      "HKQuantityTypeIdentifierStepCount",
      "HKQuantityTypeIdentifierBodyMass",
      "HKQuantityTypeIdentifierRestingHeartRate",
      "HKQuantityTypeIdentifierHeartRate",
      "HKCategoryTypeIdentifierSleepAnalysis",
      "HKWorkoutTypeIdentifier",
      "HKQuantityTypeIdentifierActiveEnergyBurned",
    ],
  });
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000);
  await saveQuantitySample("HKQuantityTypeIdentifierStepCount", "count", 4321, at(2), at(1));
  await saveQuantitySample("HKQuantityTypeIdentifierBodyMass", "kg", 78.4, at(1), at(1));
  await saveQuantitySample("HKQuantityTypeIdentifierRestingHeartRate", "count/min", 54, at(3), at(3));
  // Last night: 23:00 → 06:30 core, with an hour of deep.
  const night = new Date(now);
  night.setHours(6, 30, 0, 0);
  const bed = new Date(night.getTime() - 7.5 * 3_600_000);
  await saveCategorySample("HKCategoryTypeIdentifierSleepAnalysis", 3, bed, new Date(bed.getTime() + 3 * 3_600_000));
  await saveCategorySample("HKCategoryTypeIdentifierSleepAnalysis", 4, new Date(bed.getTime() + 3 * 3_600_000), new Date(bed.getTime() + 4 * 3_600_000));
  await saveCategorySample("HKCategoryTypeIdentifierSleepAnalysis", 3, new Date(bed.getTime() + 4 * 3_600_000), night);
  const start = at(5);
  const end = at(4.25);
  await saveWorkoutSample(37, [{ quantityType: "HKQuantityTypeIdentifierActiveEnergyBurned", quantity: 310, unit: "kcal", startDate: start, endDate: end }], start, end);
  for (let i = 0; i < 40; i++) {
    const t = new Date(start.getTime() + i * 60_000);
    await saveQuantitySample("HKQuantityTypeIdentifierHeartRate", "count/min", 120 + (i % 10) * 3, t, t);
  }
}

/** Debug builds: the same from the Hermes inspector (`__pulsoHealth.addSamples()`), for checks without tapping. */
if (__DEV__) (globalThis as Record<string, unknown>).__pulsoHealth = { addSamples: addSampleHealthData };
