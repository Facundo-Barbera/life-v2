import type { SleepSegment as DbSegment } from "@life/db";
import type { Workout } from "@/contract";
import { buildNight, nightOf, type StoredSegment } from "../logic/sleep-metrics";
import { iso, ms, nn, ok, P, rows } from "./db";
import type { OpTable } from "./types";

// What the phone's Apple Health sync writes: nights of sleep (one row per night
// with source healthkit: the preferred device's samples, stages in minutes)
// and Health workouts (pulso.health_workouts, tied to a Pulso session when its
// external ref is the session's id).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const healthOps: OpTable = {
  async sync_sleep(ctx, { segments }) {
    const byNight = new Map<string, StoredSegment[]>();
    for (const s of segments) {
      if (s.end <= s.start) continue;
      const night = nightOf(s.start, s.tzOffsetMin);
      byNight.set(night, [...(byNight.get(night) ?? []), { ...s, night }]);
    }
    const nights = [...byNight].map(([night, segs]) => buildNight(night, segs)).filter((n) => !!n);
    if (!nights.length) return { nights: 0 };
    ok(
      await P(ctx)
        .from("sleeps")
        .upsert(
          nights.map((n) => ({
            user_id: ctx.userId,
            source: "healthkit" as const,
            night: n.night,
            started_at: iso(n.inBedStart),
            ended_at: iso(Math.max(n.inBedEnd, n.inBedStart + 60_000)),
            asleep_min: Math.round(n.minutes.asleep),
            stages: { deep: n.minutes.deep, core: n.minutes.core, rem: n.minutes.rem, awake: n.minutes.awake },
            segments: n.segments.map((s): DbSegment => ({ start: iso(s.start), end: iso(s.end), stage: s.stage })),
            notes: n.source,
          })),
          { onConflict: "user_id,night,source" },
        ),
    );
    return { nights: nights.length };
  },
  async sync_workouts(ctx, { workouts }) {
    if (!workouts.length) return { written: 0 };
    // Pulso's own sessions saved to Health carry the session id as their external ref.
    const refs = [...new Set(workouts.map((w) => w.externalRef?.replace(/-\d+$/, "")).filter((r): r is string => !!r && UUID.test(r)))];
    const sessions = refs.length ? new Set(rows(await P(ctx).from("workouts").select("id").in("id", refs)).map((w) => w.id)) : new Set<string>();
    for (let i = 0; i < workouts.length; i += 200) {
      const batch = workouts.slice(i, i + 200).filter((w) => w.endedAt >= w.startedAt);
      ok(
        await P(ctx)
          .from("health_workouts")
          .upsert(
            batch.map((w) => {
              const ref = w.externalRef?.replace(/-\d+$/, "");
              return {
                user_id: ctx.userId,
                external_id: w.externalId,
                activity: w.activity,
                started_at: iso(w.startedAt),
                ended_at: iso(w.endedAt),
                energy_kcal: w.energy,
                distance_m: w.distance,
                avg_hr: w.avgHeartRate ?? null,
                max_hr: w.maxHeartRate ?? null,
                source_name: w.sourceName ?? null,
                source_bundle: w.sourceBundle ?? null,
                workout_id: ref && sessions.has(ref) ? ref : null,
              };
            }),
            { onConflict: "user_id,external_id" },
          ),
      );
    }
    return { written: workouts.length };
  },
  async list_workouts(ctx, { limit }) {
    const list = rows(await P(ctx).from("health_workouts").select("*").is("workout_id", null).order("started_at", { ascending: false }).limit(limit));
    return list.map(
      (w): Workout => ({
        id: w.id,
        externalId: w.external_id,
        source: "healthkit",
        activity: w.activity,
        startedAt: ms(w.started_at),
        endedAt: ms(w.ended_at),
        energy: nn(w.energy_kcal),
        distance: nn(w.distance_m),
        sourceBundle: w.source_bundle,
        sourceName: w.source_name,
        avgHeartRate: nn(w.avg_hr),
        maxHeartRate: nn(w.max_hr),
      }),
    );
  },
};
