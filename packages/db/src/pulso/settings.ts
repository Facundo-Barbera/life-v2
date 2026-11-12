import type { LifeClient } from "../index";
import type { PulsoSettings } from "../types";
import { must, pulso, userId } from "./core";
import { DEFAULT_TZ } from "./dates";

/** The person's settings row; created with defaults when missing (older accounts). */
export async function getSettings(client: LifeClient): Promise<PulsoSettings> {
  const uid = await userId(client);
  const found = await pulso(client).from("settings").select("*").eq("user_id", uid).maybeSingle();
  if (found.data) return found.data;
  return must(await pulso(client).from("settings").upsert({ user_id: uid, timezone: DEFAULT_TZ }).select("*").single());
}

export type SettingsPatch = Partial<Omit<PulsoSettings, "user_id" | "created_at" | "updated_at">>;

export async function updateSettings(client: LifeClient, patch: SettingsPatch): Promise<PulsoSettings> {
  const uid = await userId(client);
  await getSettings(client);
  return must(await pulso(client).from("settings").update(patch).eq("user_id", uid).select("*").single());
}
