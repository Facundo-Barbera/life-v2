import { router, type Href } from "expo-router";
import { useOperation } from "@/data/queries";
import { Button } from "@/ui/Button";
import { ListRow, Rows } from "@/ui/ListRow";
import { Panel } from "@/ui/Panel";
import { Skeleton } from "@/ui/States";
import { dayMeta } from "./format";

/** Entreno's live session route (a full-screen modal outside the tabs). */
const SESSION = "/sesion" as Href;

const SHORT_DAY = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", timeZone: "UTC" });
const pad = (n: number) => String(n).padStart(2, "0");

/** «HOY · 18:00», «MAÑANA», «JUE 29»: when the next session is, in the row's caps. */
export function whenOf(date: string, time: string | null, now = new Date()): string {
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const label = date === day(0) ? "HOY" : date === day(1) ? "MAÑANA" : SHORT_DAY.format(new Date(`${date}T12:00:00Z`)).toUpperCase();
  return time ? `${label} · ${time}` : label;
}

/** What's on today: the next workout with «EMPEZAR» (or «SEGUIR» while one is live). The doses are in Medicación's panel below it. */
export function TodayPanel() {
  const program = useOperation("get_training_program", {});
  const live = useOperation("get_live_session", {});

  if (program.data === undefined && !program.isError)
    return (
      <Panel>
        <Skeleton height={36} />
      </Panel>
    );

  const p = program.data?.program;
  const next = p?.days.find((d) => d.id === program.data?.nextDayId) ?? p?.days[0];
  // Siguiente is a dated session: «HOY · 18:00» when it is today's, else its day.
  const nextId = program.data?.nextInstanceId;
  const dated = program.data?.blocks?.flatMap((b) => b.weeks.flatMap((w) => w.instances ?? [])).find((i) => i.id === nextId) ?? null;
  const when = dated ? whenOf(dated.date, dated.time) : null;
  const session = live.data?.session;

  const rows = [];
  if (session)
    rows.push(
      <ListRow
        key="live"
        icon="figure.strengthtraining.traditional"
        title={session.name}
        subtitle={`EN CURSO · ${session.exercises.length} EJ`}
        trailing={<Button title="Seguir" icon="play.fill" variant="accent" onPress={() => router.push(SESSION)} testID="today-continue" />}
      />,
    );
  else if (next)
    rows.push(
      <ListRow
        key="next"
        testID="today-workout"
        icon="dumbbell.fill"
        title={next.name}
        subtitle={[when, next.focus?.toUpperCase(), dayMeta(next.exercises)].filter(Boolean).join(" · ")}
        trailing={
          <Button
            title="Empezar"
            icon="play.fill"
            variant="accent"
            onPress={() => router.push(`${SESSION}?dia=${encodeURIComponent(next.id)}${dated ? `&sesion=${encodeURIComponent(dated.id)}` : ""}` as Href)}
            testID="today-start"
          />
        }
      />,
    );
  else if (program.data)
    rows.push(
      <ListRow
        key="none"
        icon="dumbbell"
        title="Sin programa de entreno"
        subtitle="CRÉALO EN PULSO.BIXKU.ONLINE"
        trailing={<Button title="Crear" onPress={() => router.push("/entreno")} />}
      />,
    );

  if (rows.length === 0) return null;
  return (
    <Panel style={{ paddingVertical: 4 }} testID="today">
      <Rows>{rows}</Rows>
    </Panel>
  );
}
