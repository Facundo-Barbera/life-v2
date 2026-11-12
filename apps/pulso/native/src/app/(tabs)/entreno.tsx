import type { BlockProposal, LoadSuggestion, NextAdjustment, Program, ProgramDay, ProgramWeek, TrainingBlock, TrainingSession, WeekDay } from "@/contract";
import { router, type Href } from "expo-router";
import { memo, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useAction } from "@/data/actions";
import { useOperation } from "@/data/queries";
import { formatTimer, useNow } from "@/shell/session";
import { useTheme, type ColorTokens } from "@/theme";
import { SegmentBar } from "@/ui/Bars";
import { BigButton, Button, IconButton } from "@/ui/Button";
import { haptics } from "@/ui/haptics";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Rows } from "@/ui/ListRow";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { PressableScale } from "@/ui/Pressable";
import { Screen } from "@/ui/Screen";
import { StatCell } from "@/ui/StatCell";
import { EmptyState, LoadingState } from "@/ui/States";
import { Text } from "@/ui/Text";
import { setsDone, setsTotal } from "@/training/live/state";
import {
  blockProgress,
  canRepeat,
  cardWhen,
  datedBlock,
  isToday,
  clampPick,
  dayAction,
  dayMark,
  defaultPick,
  pickInWeek,
  selectionKey,
  sessionVolume,
  topSets,
  weekCards,
  type CardDay,
  type DayAction,
  type DayMark,
  type DayPick,
} from "@/training/selector";
import { training, useLive, useTraining } from "@/training/store";
import { DayCarousel, DayPills, MarkGlyph, WeekSelector, type CarouselHandle, type PillItem } from "@/training/ui/navigator";
import { ProposalCard, WeekPlanLine } from "@/training/ui/block";
import { DayExercises, DayFigures, dayMinutes, daySets } from "@/training/ui/plan";
import { MenuSheet, type MenuItem } from "@/training/ui/sheets";
import { number, shown, toUnit } from "@/training/units";

// Entreno (SwiftUI's TrainingView) in Tablero: the block's week selector and
// that week's days as pills, the session in progress to come back to, the
// chosen day as the hero (the plan with «EMPEZAR», or what was lifted), recent
// sessions with their figures, and the program's notes folded. Units, the
// Coach and switching programs live in the menu.

const NO_SUGGESTIONS: Record<string, LoadSuggestion> = {};

const startHref = (dayId: string, instanceId?: string | null) => ({ pathname: "/sesion", params: instanceId ? { dia: dayId, sesion: instanceId } : { dia: dayId } }) as unknown as Href;

export default function Entreno() {
  const store = useTraining();
  const live = useLive();
  const { run } = useAction();
  const [menu, setMenu] = useState(false);
  const { space } = useTheme();
  const p = store.program;
  const program = p?.program ?? null;
  const raw = p?.blocks?.find((b) => b.programId === program?.id) ?? null;
  // The week's cards are its dated sessions, by date.
  const block = useMemo(() => raw && datedBlock(raw, p?.nextInstanceId ?? null), [raw, p?.nextInstanceId]);

  const refresh = () => void store.load();
  const items: MenuItem[] = [
    { title: `Unidad por defecto: ${store.settings.defaultUnit === "kg" ? "kilos" : "libras"}`, icon: "scalemass", onPress: () => void store.setDefaultUnit(store.settings.defaultUnit === "kg" ? "lb" : "kg").catch(() => {}) },
  ];
  const fresh: HeroActions = {
    onStart: (d, instanceId) => router.push(startHref(d.id, instanceId)),
    onPreview: (d) => router.push(`/entreno/dia/${d.id}` as Href),
    onSession: (id) => router.push(`/entreno/sesion/${id}` as Href),
    onNextWeek: (n) =>
      Alert.alert(`¿Empezar la semana ${n} ya?`, "Esta semana queda cerrada con lo que hiciste y la siguiente empieza hoy.", [
        { text: "Cancelar", style: "cancel" },
        { text: "Empezar ya", onPress: () => void run("start_next_week", {}).then((r) => store.apply(r)).catch(() => {}) },
      ]),
    onRepeat: (d) =>
      Alert.alert(`¿Repetir ${d.name}?`, "Ya lo hiciste esta semana. Se guarda como otra sesión del mismo día y no cambia cuál toca después.", [
        { text: "Cancelar", style: "cancel" },
        { text: `Repetir ${d.name}`, onPress: () => router.push(startHref(d.id)) },
      ]),
    onDismiss: (a) => void run("dismiss_session_adjustment", { id: a.id, dismissed: !a.dismissed }).then((r) => store.apply(r)).catch(() => {}),
  };
  // Stable for the memoized day cards; each call reaches this render's handlers.
  const latest = useRef(fresh);
  latest.current = fresh;
  const actions = useMemo<HeroActions>(
    () => ({
      onStart: (d, instanceId) => latest.current.onStart(d, instanceId),
      onPreview: (d) => latest.current.onPreview(d),
      onSession: (id) => latest.current.onSession(id),
      onNextWeek: (n) => latest.current.onNextWeek(n),
      onRepeat: (d) => latest.current.onRepeat(d),
      onDismiss: (a) => latest.current.onDismiss(a),
    }),
    [],
  );

  return (
    <Screen
      title="ENTRENO"
      refreshing={false}
      onRefresh={refresh}
      accessory={program ? <IconButton icon="ellipsis" size={28} onPress={() => setMenu(true)} accessibilityLabel="Opciones" testID="entreno-menu" /> : undefined}
    >
      {program && block ? (
        <BlockView
          block={block}
          program={program}
          title={(p?.blocks?.length ?? 0) > 1 ? `Bloque ${block.number} · ${program.name}` : program.name}
          nextDayId={p?.nextDayId ?? null}
          nextInstanceId={p?.nextInstanceId ?? null}
          adjustment={p?.adjustment ?? null}
          suggestions={p?.suggestions ?? NO_SUGGESTIONS}
          sessions={store.sessions}
          liveDayId={live ? (live.state.dayId ?? null) : undefined}
          actions={actions}
          proposal={p?.proposal ?? null}
          onProposal={(id, accept) => run(accept ? "accept_block_proposal" : "discard_block_proposal", { id }).then(() => store.load())}
        />
      ) : program ? (
        <>
          {live ? <ResumeCard /> : null}
          {store.nextDay ? (
            <Panel style={{ gap: space.md }} testID="entreno-hero">
              <PlanHero day={store.nextDay} label={["Siguiente", "accentText"]} trailing={undefined} adjustment={p?.adjustment ?? null} suggestions={p?.suggestions ?? NO_SUGGESTIONS} running={!!live} actions={actions} />
            </Panel>
          ) : null}
        </>
      ) : p ? (
        <EmptyState
          icon="dumbbell"
          title="Aún no tienes rutina"
          message="Crea tu programa en pulso.bixku.online: lo verás aquí con los pesos sugeridos para cada día."
        />
      ) : (
        <LoadingState lines={4} />
      )}
      {program && store.sessions.length ? <Recent sessions={store.sessions} /> : null}
      {program ? <About goal={program.goal} notes={program.notes} weeks={program.weeks} days={program.days.length} /> : null}
      <MenuSheet visible={menu} onClose={() => setMenu(false)} title="ENTRENO" items={items} />
    </Screen>
  );
}

type HeroActions = {
  /** `instanceId`: the dated session it starts as. */
  onStart: (d: ProgramDay, instanceId?: string | null) => void;
  onPreview: (d: ProgramDay) => void;
  onSession: (id: string) => void;
  /** Confirms, then starts week `n` now. */
  onNextWeek: (n: number) => void;
  onRepeat: (d: ProgramDay) => void;
  onDismiss: (a: NextAdjustment) => void;
};

/**
 * The block with a week and a day chosen: the week selector, the day pills,
 * the session in progress, then the week's days as cards in a horizontal
 * scroll the pills follow. It opens on the next day; a session logged or a
 * week started brings it back there. Scrolling past the week's last (or
 * first) day reaches the neighbouring week's card; resting on it moves there.
 */
function BlockView(props: {
  block: TrainingBlock;
  program: Program;
  title: string;
  nextDayId: string | null;
  nextInstanceId: string | null;
  adjustment: NextAdjustment | null;
  suggestions: Record<string, LoadSuggestion>;
  sessions: TrainingSession[];
  /** The live session's day (null: a free session); undefined when nothing is live. */
  liveDayId: string | null | undefined;
  actions: HeroActions;
  /** The Coach's pending proposal for the next block. */
  proposal: BlockProposal | null;
  onProposal: (id: string, accept: boolean) => Promise<unknown>;
}) {
  const { space } = useTheme();
  const { block, program, nextDayId, proposal } = props;
  const key = selectionKey(block, nextDayId, props.nextInstanceId);
  const [chosen, setChosen] = useState<{ key: string; pick: DayPick } | null>(null);
  // An edge card in the middle of the scroll lights its pill without moving the week yet.
  const [edge, setEdge] = useState<string | null>(null);
  const carousel = useRef<CarouselHandle>(null);
  const pick = (chosen?.key === key ? clampPick(block, chosen.pick) : null) ?? defaultPick(block, nextDayId);
  const week = block.weeks.find((w) => w.number === pick.week);
  const cards = useMemo(() => weekCards(block, pick.week), [block, pick.week]);

  const choose = (to: DayPick | null) => {
    if (!to || (to.week === pick.week && to.index === pick.index)) return;
    haptics.select();
    setEdge(null);
    setChosen({ key, pick: to });
  };
  // The scroll is the source of the chosen day within the week.
  const onCenter = (i: number) => {
    const c = cards[i];
    if (!c) return;
    haptics.select();
    setEdge(c.edge ? c.key : null);
    if (!c.edge) setChosen({ key, pick: c.pick });
  };
  const onSettle = (i: number) => {
    const c = cards[i];
    if (c?.edge) choose(c.pick);
  };

  if (!week || !cards.length) return null;
  const cardOf = (p: DayPick) => block.weeks.find((w) => w.number === p.week)?.days[p.index];
  const pills: PillItem[] = cards.map((c) => {
    const w = block.weeks.find((x) => x.number === c.pick.week)!;
    const d = w.days[c.pick.index]!;
    return { key: c.key, title: d.name, mark: dayMark(d, w, nextDayId), week: c.edge ? `S${w.number}` : undefined };
  });
  const selected = edge ?? cards.find((c) => !c.edge && c.pick.index === pick.index)?.key ?? cards[0]!.key;
  const done = Math.round(blockProgress(block) * 100);

  return (
    <>
      <Panel style={{ gap: space.md, paddingBottom: space.md }} testID="entreno-nav">
        <PanelHeader title={props.title} trailing={`Bloque ${done} %`} />
        <WeekSelector weeks={block.weeks} selected={week.number} current={block.currentWeek} onSelect={(n) => choose(pickInWeek(block, pick, n))} />
        <View style={{ marginHorizontal: -space.gutter }}>
          <DayPills
            items={pills}
            selected={selected}
            onSelect={(k) => {
              const i = cards.findIndex((c) => c.key === k);
              const c = cards[i];
              if (c?.edge) choose(c.pick);
              else if (c) carousel.current?.scrollTo(i);
            }}
          />
        </View>
        <WeekPlanLine block={block} week={week} />
      </Panel>
      {proposal ? <ProposalCard proposal={proposal} onAccept={() => props.onProposal(proposal.id, true)} onDiscard={() => props.onProposal(proposal.id, false)} /> : null}
      {props.liveDayId !== undefined ? <ResumeCard /> : null}
      {block.weekComplete && !block.canStartNextWeek ? (
        <Panel style={{ gap: space.sm }}>
          <PanelHeader title="Programa completado" color="accentText" />
          <Text variant="body" color="textSecondary">
            Hiciste las {block.weeks.length} semanas. Arma el siguiente bloque en pulso.bixku.online: tu historial y tus cargas siguen contigo.
          </Text>
        </Panel>
      ) : null}
      <View style={{ marginHorizontal: -space.gutter }}>
        <DayCarousel
          // A new week (or a reset to the next day) starts a fresh scroll at its card.
          key={`${week.number}:${key}`}
          ref={carousel}
          count={cards.length}
          initial={Math.max(0, cards.findIndex((c) => !c.edge && c.pick.index === pick.index))}
          onCenter={onCenter}
          onSettle={onSettle}
          renderCard={(i) => {
            const c = cards[i]!;
            const w = block.weeks.find((x) => x.number === c.pick.week)!;
            if (c.edge) return <WeekCard week={w} total={block.weeks.length} dir={c.edge} nextDayId={nextDayId} onPress={() => choose(c.pick)} />;
            const wd = cardOf(c.pick)!;
            // Today's days (with any «solo hoy» change) for the current week; the days as written for the others.
            const days = w.state === "current" || !block.days.length ? program.days : block.days;
            const day = days.find((d) => d.id === wd.dayId) ?? program.days.find((d) => d.id === wd.dayId) ?? null;
            return (
              <DayHero
                block={block}
                week={w}
                wd={wd}
                mark={dayMark(wd, w, nextDayId)}
                day={day}
                adjustment={props.adjustment}
                suggestions={props.suggestions}
                sessions={props.sessions}
                liveDayId={props.liveDayId}
                actions={props.actions}
              />
            );
          }}
        />
      </View>
    </>
  );
}

/** The neighbouring week at the scroll's end: its name, how it went and its days; resting on it (or a tap) moves there. */
function WeekCard({ week, total, dir, nextDayId, onPress }: { week: ProgramWeek; total: number; dir: 1 | -1; nextDayId: string | null; onPress: () => void }) {
  const { space, type } = useTheme();
  return (
    <PressableScale onPress={onPress} feedback="select" accessibilityLabel={`Ir a la semana ${week.number}`} testID={`week-card-${week.number}`}>
      <Panel style={{ gap: space.md }}>
        <PanelHeader title={dir > 0 ? "Semana siguiente" : "Semana anterior"} trailing={`${week.done}/${week.days.length} días${week.deload ? " · descarga" : ""}`} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {dir < 0 ? <Icon name="chevron.left" size={16} color="textTertiary" /> : null}
          <Text style={[type.largeTitle, { flex: 1, fontSize: 40, lineHeight: 44, letterSpacing: -1.6 }]} numberOfLines={1}>
            Semana {week.number}
          </Text>
          {dir > 0 ? <Icon name="chevron.right" size={16} color="textTertiary" /> : null}
        </View>
        <Text variant="subhead" color="textSecondary" style={{ marginTop: -space.sm }}>
          {week.number} de {total} · {week.state === "past" ? "pasada" : week.state === "current" ? "ahora" : "por venir"}
        </Text>
        <Hairline />
        <View style={{ gap: space.sm }}>
          {week.days.map((d) => (
            <View key={d.dayId} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ width: 16, alignItems: "center" }}>
                <MarkGlyph mark={dayMark(d, week, nextDayId)} onLime={false} />
              </View>
              <Text variant="rowTitle" numberOfLines={1}>
                {d.name}
              </Text>
            </View>
          ))}
        </View>
      </Panel>
    </PressableScale>
  );
}

/** The workout in progress: a live dot, its clock, sets done as a strip and «SEGUIR». */
function ResumeCard() {
  const live = useLive();
  const now = useNow(!!live);
  const { colors, space } = useTheme();
  if (!live) return null;
  const s = live.state;
  const done = setsDone(s);
  const total = setsTotal(s);
  const current = s.exercises[s.focus]?.name;
  return (
    <PressableScale onPress={() => router.push("/sesion" as Href)} testID="resume-live" accessibilityLabel={`Sesión en curso: ${s.name}, ${done} de ${total} series. Seguir`}>
      <Panel style={{ gap: space.md, borderColor: colors.accentText }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accentText }} />
          <Text variant="label" color="accentText" style={{ flex: 1 }}>
            Sesión en curso
          </Text>
          <Text variant="numberSmall">{formatTimer({ mode: "up", startedAt: s.startedAt }, now)}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text variant="headline" numberOfLines={1}>
              {s.name}
            </Text>
            <Text variant="meta" color="textSecondary" numberOfLines={1}>
              {done}/{total} series{current ? ` · ahora ${current}` : ""}
            </Text>
          </View>
          <View style={{ height: 40, paddingHorizontal: 16, borderRadius: 10, borderCurve: "continuous", backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text variant="button" color="onAccent">
              Seguir
            </Text>
            <Icon name="arrow.right" size={13} color="onAccent" weight="bold" />
          </View>
        </View>
        {total ? <SegmentBar count={total} done={done} current={done < total ? done : undefined} height={4} /> : null}
      </Panel>
    </PressableScale>
  );
}

const isoToday = () => ((new Date().getDay() + 6) % 7) + 1;

/** The adjustment applies to `day`: ready, with changes, not set aside. */
const appliesTo = (a: NextAdjustment | null, day: ProgramDay | null): a is NextAdjustment =>
  !!a && !!day && a.dayId === day.id && a.status === "ready" && !a.noChange && !a.dismissed && a.changes.length > 0;

/** A day's card: its header line, then the plan to start or what was lifted. Memoized: the scroll re-renders its parent at each card. */
const DayHero = memo(function DayHero(props: {
  block: TrainingBlock;
  week: ProgramWeek;
  wd: CardDay;
  mark: DayMark;
  day: ProgramDay | null;
  adjustment: NextAdjustment | null;
  suggestions: Record<string, LoadSuggestion>;
  sessions: TrainingSession[];
  liveDayId: string | null | undefined;
  actions: HeroActions;
}) {
  const { space } = useTheme();
  const { block, week, wd, mark, day } = props;
  // Starting this card starts its dated session.
  const actions = useMemo<HeroActions>(() => ({ ...props.actions, onStart: (d) => props.actions.onStart(d, wd.instanceId ?? null) }), [props.actions, wd.instanceId]);
  const when = cardWhen(wd);
  const action = dayAction(block, week, mark);
  const current = week.state === "current";
  const isLive = current && props.liveDayId === wd.dayId;
  const trailing = `Sem ${week.number}/${block.weeks.length} · ${week.done}/${week.days.length} días${week.deload ? " · descarga" : ""}`;
  const label: [string, keyof ColorTokens] = isLive
    ? ["En curso", "accentText"]
    : mark === "done"
      ? ["Hecho", "accentText"]
      : mark === "partial"
        ? ["A medias", "warning"]
        : mark === "skipped"
          ? ["No hecho", "textTertiary"]
          : mark === "next"
            ? [[(wd.date ? isToday(wd) : day?.weekday === isoToday()) ? "Hoy toca" : "Siguiente", wd.date && !isToday(wd) ? when : wd.time].filter(Boolean).join(" · "), "accentText"]
            : current
              ? [["Pendiente", when].filter(Boolean).join(" · "), "textSecondary"]
              : week.state === "future"
                ? [`Semana ${week.number}`, "textSecondary"]
                : ["Pendiente", "textSecondary"];

  return (
    <Panel style={{ gap: space.md }} testID="entreno-hero">
      {action === "logged" ? (
        <LoggedDay wd={wd} day={day} label={label} trailing={trailing} sessions={props.sessions} repeat={day && canRepeat(week, mark) ? () => actions.onRepeat(day) : undefined} onSession={actions.onSession} />
      ) : day ? (
        <PlanHero
          day={day}
          label={label}
          trailing={trailing}
          // The Coach's review is of the next day only, not the same day in other weeks.
          adjustment={mark === "next" ? props.adjustment : null}
          suggestions={props.suggestions}
          running={props.liveDayId !== undefined}
          actions={actions}
          mode={action}
          note={
            action === "missed"
              ? wd.date && current
                ? "Su fecha pasó sin hacerla."
                : "Esa semana terminó sin este día."
              : action === "startWeek"
                ? `Completaste la semana ${block.currentWeek}. Puedes descansar hasta el lunes o empezar ya la semana ${week.number}.`
                : week.state === "future"
                  ? `Si lo empiezas ya, cuenta para la semana ${block.currentWeek}.`
                  : undefined
          }
          nextWeek={week.number}
        />
      ) : (
        <PanelHeader title={label[0]} color={label[1]} trailing={trailing} />
      )}
    </Panel>
  );
});

/** A day's name, large, with its focus; tapping it opens the day (or the session). */
function DayTitle({ name, focus, onPress, hint }: { name: string; focus?: string | null; onPress: () => void; hint: string }) {
  const { space, type } = useTheme();
  return (
    <PressableScale onPress={onPress} feedback="select" accessibilityHint={hint} accessibilityLabel={`${name}${focus ? `, ${focus}` : ""}`} style={{ marginTop: -4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text style={[type.largeTitle, { flex: 1, fontSize: 40, lineHeight: 44, letterSpacing: -1.6 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {name}
        </Text>
        <Icon name="chevron.right" size={16} color="textTertiary" />
      </View>
      {focus ? (
        <Text variant="subhead" color="textSecondary" style={{ marginTop: 2 }}>
          {focus}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** A day to do: figures, the Coach's callout, EMPEZAR (or «Empezar la semana N ya»), the exercises. */
function PlanHero(props: {
  day: ProgramDay;
  label: [string, keyof ColorTokens];
  trailing: string | undefined;
  adjustment: NextAdjustment | null;
  suggestions: Record<string, LoadSuggestion>;
  running: boolean;
  actions: HeroActions;
  mode?: DayAction;
  note?: string;
  nextWeek?: number;
}) {
  const { space } = useTheme();
  const { day, adjustment, actions, mode = "start" } = props;
  const applies = appliesTo(adjustment, day);
  const shown = applies ? adjustment.day : day;
  const suggestions = applies ? adjustment.suggestions : props.suggestions;
  const note = props.note ? (
    <Text variant="footnote" color="textSecondary">
      {props.note}
    </Text>
  ) : null;
  return (
    <>
      <PanelHeader title={props.label[0]} color={props.label[1]} trailing={props.trailing} />
      <DayTitle name={day.name} focus={day.focus} onPress={() => actions.onPreview(day)} hint="Muestra los ejercicios" />
      <DayFigures day={shown} />
      {mode === "missed" ? (
        note
      ) : mode === "startWeek" ? (
        <>
          {note}
          <Button title={`Empezar la semana ${props.nextWeek} ya`} icon="forward.end.fill" variant="accent" wide style={{ height: 56 }} onPress={() => actions.onNextWeek(props.nextWeek ?? 0)} testID="start-week" />
        </>
      ) : props.running ? (
        <Text variant="footnote" color="textSecondary" style={{ textAlign: "center" }}>
          Termina la sesión en curso para empezar otra.
        </Text>
      ) : (
        <>
          <BigButton
            title="EMPEZAR"
            detail={`${day.name}\n~${dayMinutes(shown)} min · ${daySets(shown)} series`}
            onPress={() => actions.onStart(day)}
            testID="start-day"
            style={{ height: 64, borderRadius: 14 }}
          />
          {note}
        </>
      )}
      <Hairline />
      <View style={{ marginTop: -space.sm }}>
        <DayExercises day={shown} suggestions={suggestions} changes={applies ? adjustment.changes : []} />
      </View>
    </>
  );
}

/** A day done: when, its figures, «Ver sesión» (and «Repetir»), then each exercise's top set. */
function LoggedDay({ wd, day, label, trailing, sessions, repeat, onSession }: { wd: WeekDay; day: ProgramDay | null; label: [string, keyof ColorTokens]; trailing: string; sessions: TrainingSession[]; repeat?: () => void; onSession: (id: string) => void }) {
  const { space } = useTheme();
  const last = wd.sessions.at(-1)!;
  const local = sessions.find((s) => s.id === last.id);
  const remote = useOperation("get_training_session", { id: last.id }, { enabled: !local });
  const full = local ?? remote.data ?? null;
  const library = useOperation("list_exercise_library", {}, { enabled: !!full, staleTime: 60 * 60_000 });
  const names = new Map<string, string>((library.data?.exercises ?? []).map((e) => [e.id, e.name]));
  for (const e of day?.exercises ?? []) names.set(e.exerciseId, e.exerciseName);
  const unit = training.settings.defaultUnit;
  const minutes = Math.max(0, Math.round((last.endedAt - last.startedAt) / 60_000));
  const d = duration(minutes);
  const tops = full ? topSets(full.sets) : [];
  const when = new Date(last.startedAt).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/\./g, "");
  return (
    <>
      <PanelHeader title={label[0]} color={label[1]} trailing={trailing} />
      <DayTitle name={wd.name} focus={`${when}${wd.sessions.length > 1 ? ` · ${wd.sessions.length} sesiones` : ""}`} onPress={() => onSession(last.id)} hint="Abre la sesión" />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <StatCell bare label="Series" value={last.sets} style={{ flex: 1 }} />
        <StatCell bare label="Volumen" value={full ? number(Math.round(toUnit(sessionVolume(full), unit))) : "—"} unit={full ? unit : undefined} style={{ flex: 1 }} />
        <StatCell bare label="Duración" value={d.value} unit={d.unit} style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button title="Ver sesión" icon="list.bullet.rectangle" onPress={() => onSession(last.id)} style={{ flex: 1 }} testID="see-session" />
        {repeat ? <Button title="Repetir" icon="arrow.clockwise" onPress={repeat} testID="repeat-day" /> : null}
      </View>
      {tops.length ? (
        <>
          <Hairline />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: -space.sm }}>
            <Text variant="labelSmall" color="textSecondary">
              {tops.length} ejercicios
            </Text>
            <Text variant="labelSmall" color="textSecondary">
              Mejor serie
            </Text>
          </View>
          <View>
            <Rows>
              {tops.map((t, i) => (
                <View key={t.exerciseId} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 9, minHeight: 48 }}>
                  <Text variant="meta" color="textTertiary" style={{ width: 20 }}>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="rowTitle" numberOfLines={1}>
                      {names.get(t.exerciseId) ?? "Ejercicio"}
                    </Text>
                    <Text variant="meta" color="textSecondary" style={{ marginTop: 3 }}>
                      {t.sets} {t.sets === 1 ? "serie" : "series"}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                    {t.weightKg ? (
                      <>
                        <Text variant="numberSmall">{number(shown(t.weightKg, training.unit(t.exerciseId)))}</Text>
                        <Text variant="labelSmall" color="textSecondary" style={{ marginLeft: 2, textTransform: "none" }}>
                          {training.unit(t.exerciseId)}
                        </Text>
                        <Text variant="numberSmall" color="textSecondary" style={{ marginLeft: 6 }}>
                          × {t.reps}
                        </Text>
                      </>
                    ) : (
                      <Text variant="numberSmall">{t.reps} reps</Text>
                    )}
                  </View>
                </View>
              ))}
            </Rows>
          </View>
        </>
      ) : null}
    </>
  );
}
/** A quiet 36 pt action inside a callout. */
function SmallAction({ title, icon, onPress }: { title: string; icon: SFSymbol; onPress: () => void }) {
  const { colors, hairline } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={title}
      hitSlop={6}
      style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, borderCurve: "continuous", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface, borderWidth: hairline, borderColor: colors.separator }}
    >
      <Icon name={icon} size={12} color="textSecondary" />
      <Text variant="labelSmall" style={{ fontSize: 10.5 }}>
        {title}
      </Text>
    </PressableScale>
  );
}

const shortDate = (at: number) => new Date(at).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");

/** «47» MIN, or «4:54» H past an hour. */
const duration = (minutes: number) => (minutes < 60 ? { value: String(minutes), unit: "min" } : { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`, unit: "h" });

function Recent({ sessions }: { sessions: TrainingSession[] }) {
  const { colors, space } = useTheme();
  return (
    <Panel style={{ gap: space.xs }} testID="entreno-recent">
      <PanelHeader title="Últimas sesiones" />
      <Rows>
        {sessions.slice(0, 5).map((s) => {
          const minutes = Math.max(0, Math.round(((s.recorded?.endedAt ?? s.endedAt) - (s.recorded?.startedAt ?? s.startedAt)) / 60_000));
          const d = duration(minutes);
          const vol = Math.round(toUnit(sessionVolume(s), training.settings.defaultUnit));
          const meta = [shortDate(s.startedAt), s.recorded?.energy ? `${Math.round(s.recorded.energy)} kcal` : null].filter(Boolean).join(" · ");
          return (
            <PressableScale key={s.id} onPress={() => router.push(`/entreno/sesion/${s.id}` as Href)} feedback="select" testID={`recent-${s.id}`} accessibilityLabel={`${s.name}, ${meta}`}>
              <View style={{ flexDirection: "row", gap: space.md, paddingVertical: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={s.merged ? "applewatch" : "figure.strengthtraining.traditional"} size={16} color="accentText" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                    <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                      {s.name}
                    </Text>
                    <Text variant="meta" color="textSecondary">
                      {meta}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: space.lg, marginTop: 2 }}>
                    <Mini value={d.value} unit={d.unit} />
                    <Mini value={String(s.sets.length)} unit="series" />
                    {vol ? <Mini value={number(vol)} unit={training.settings.defaultUnit} /> : null}
                  </View>
                </View>
                <View style={{ alignSelf: "center" }}>
                  <Icon name="chevron.right" size={12} color="textTertiary" />
                </View>
              </View>
            </PressableScale>
          );
        })}
      </Rows>
    </Panel>
  );
}

function Mini({ value, unit }: { value: string; unit: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
      <Text variant="numberSmall">{value}</Text>
      <Text variant="labelSmall" color="textSecondary">
        {unit}
      </Text>
    </View>
  );
}

/** The program's goal and notes, folded to two lines. */
function About({ goal, notes, weeks, days }: { goal: string; notes: string | null; weeks: number; days: number }) {
  const { space } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <PressableScale onPress={() => setOpen((o) => !o)} feedback="select" accessibilityLabel={open ? "Plegar las notas del programa" : "Ver las notas del programa"} testID="entreno-about">
      <Panel style={{ gap: space.sm }}>
        <PanelHeader title="Sobre el programa" trailing={<Icon name={open ? "chevron.up" : "chevron.down"} size={12} color="textSecondary" />} />
        <Text variant="subhead" numberOfLines={open ? undefined : 2}>
          {goal}
        </Text>
        <Text variant="meta" color="textSecondary">
          {weeks} semanas · {days} días por semana
        </Text>
        {open && notes ? (
          <Text variant="footnote" color="textSecondary" style={{ lineHeight: 19 }}>
            {notes}
          </Text>
        ) : null}
      </Panel>
    </PressableScale>
  );
}
