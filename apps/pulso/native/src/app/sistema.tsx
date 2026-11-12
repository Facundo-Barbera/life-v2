import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LiveActivity, STRENGTH, Watch } from "pulso-watch";
import { useEngine } from "@/data/session";
import { clock } from "@/features/hoy/format";
import { healthAnswered, whenHealthAnswered } from "@/health/access";
import { addSampleHealthData } from "@/health/debug";
import { READ_ACCESS, WATCH_ACCESS } from "@/health/healthkit";
import { useHealthSync } from "@/health/sync";
import { openSubstances } from "@/sustancias/access";
import { NEUTRAL_SYMBOL } from "@/sustancias/model";
import { useAppearance, useTheme, type AppearancePref } from "@/theme";
import { Button, IconButton } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { ListRow } from "@/ui/ListRow";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Segmented } from "@/ui/Segmented";
import { ScreenHeader } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { useWatch } from "@/watch/link";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString("es-MX") : "—");

/** Ajustes: the look, the Mac, Salud, the private section, and the foundation's checks (Watch, Live Activity). */
export default function Sistema() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: space.md, paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.xxl, gap: space.sm }}
    >
      <ScreenHeader title="Ajustes" leading={<IconButton icon="xmark" onPress={() => router.back()} accessibilityLabel="Cerrar" testID="close" />} />
      <AppearancePanel />
      <EnginePanel />
      <HealthPanel />
      <PrivatePanel />
      <WatchPanel />
      <ActivityPanel />
    </ScrollView>
  );
}

function Row({ label, value, testID }: { label: string; value: ReactNode; testID?: string }) {
  const { colors, hairline } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, minHeight: 40, borderTopWidth: hairline, borderTopColor: colors.separator }}>
      <Text variant="meta" color="textSecondary">
        {label}
      </Text>
      {typeof value === "string" ? (
        <Text variant="subhead" testID={testID} style={{ flexShrink: 1, textAlign: "right" }} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

function AppearancePanel() {
  const { pref, setPref } = useAppearance();
  return (
    <Panel style={{ gap: 12 }}>
      <PanelHeader title="Apariencia" />
      <Segmented<AppearancePref>
        testID="appearance"
        value={pref}
        onChange={setPref}
        options={[
          { value: "dark", label: "Oscuro" },
          { value: "light", label: "Claro" },
          { value: "system", label: "Sistema" },
        ]}
      />
    </Panel>
  );
}

function EnginePanel() {
  const { credentials, reachability, unpair } = useEngine();
  const { colors } = useTheme();
  const state = { checking: "Comprobando…", online: "Conectada", unreachable: "Sin conexión" }[reachability];
  return (
    <Panel style={{ gap: 8 }}>
      <PanelHeader title="Tu cuenta" trailing={<Text variant="label" style={{ color: reachability === "online" ? colors.accentText : colors.warning }}>{state}</Text>} />
      <View>
        <Row label="Correo" value={credentials?.email ?? "—"} />
              </View>
      <Button title="Cerrar sesión" icon="rectangle.portrait.and.arrow.right" onPress={() => void unpair()} testID="unpair" />
    </Panel>
  );
}

function HealthPanel() {
  const health = useHealthSync();
  const [answered, setAnswered] = useState(true);
  useEffect(() => {
    void healthAnswered(READ_ACCESS).then(setAnswered);
  }, [health.lastSyncAt]);
  if (!health.available) return null;
  const r = health.lastResult;
  return (
    <Panel style={{ gap: 8 }}>
      <PanelHeader title="Salud" trailing={health.lastSyncAt ? `SINCRONIZADO ${clock(new Date(health.lastSyncAt))}` : undefined} />
      <View>
        <Row label="Último envío" value={r ? [count(r.days, "día", "días"), count(r.nights, "noche", "noches"), count(r.workouts, "entreno", "entrenos")].join(" · ") : "—"} />
        {health.error ? <Row label="Error" value={health.error} /> : null}
      </View>
      {answered ? (
        <Button title="Sincronizar ahora" icon="arrow.triangle.2.circlepath" variant="accent" busy={health.syncing} onPress={() => void health.sync()} testID="health-sync" />
      ) : (
        // Salud's sheet never goes over Ajustes: close it, and the sheet comes once the tabs are back.
        <Button
          title="Dar acceso a Salud"
          icon="heart"
          variant="accent"
          onPress={() => {
            router.back();
            void health.sync();
          }}
          testID="health-sync"
        />
      )}
      {__DEV__ ? (
        <Button title="Añadir datos de prueba (simulador)" variant="plain" onPress={() => void addSampleHealthData().then(health.sync)} testID="health-sample" />
      ) : null}
    </Panel>
  );
}

/** Sustancias' only way in: a neutral row that asks for Face ID every time (SubstancesAccess.swift). */
function PrivatePanel() {
  return (
    <Panel style={{ paddingVertical: 4 }}>
      <ListRow
        icon={NEUTRAL_SYMBOL}
        title="Sustancias"
        subtitle="CON FACE ID CADA VEZ"
        trailing={<Icon name="chevron.right" size={12} color="textTertiary" />}
        onPress={() => void openSubstances()}
        testID="sustancias-row"
      />
    </Panel>
  );
}

function WatchPanel() {
  const { state, last } = useWatch();
  const [note, setNote] = useState<string | null>(null);
  const yes = (b: boolean) => (b ? "Sí" : "No");
  return (
    <Panel style={{ gap: 8 }}>
      <PanelHeader title="Apple Watch" />
      <View>
        <Row label="WatchConnectivity" value={state.supported ? (state.activated ? "Activo" : "Activando…") : "No disponible"} testID="watch-state" />
        <Row label="Reloj emparejado" value={yes(state.paired)} />
        <Row label="Pulso instalado" value={yes(state.installed)} />
        <Row label="Al alcance" value={yes(state.reachable)} />
        <Row label="Último mensaje" value={last ? `${last.message.kind} (${last.via}) ${time(last.at)}` : "—"} />
      </View>
      <Button
        title="Publicar sesión vacía"
        onPress={() => {
          // An empty sync: what the phone publishes with no session in progress.
          const ok = Watch.publish({ kind: "sync", sync: { applied: [], units: {}, state: null, plan: null } });
          setNote(ok ? "Publicado al Watch." : "El Watch no está activo.");
        }}
      />
      {note ? (
        <Text variant="footnote" color="textSecondary">
          {note}
        </Text>
      ) : null}
    </Panel>
  );
}

function ActivityPanel() {
  const [id, setId] = useState<string | null>(LiveActivity.ids()[0] ?? null);
  const [note, setNote] = useState<string | null>(null);
  const start = async () => {
    try {
      const now = new Date();
      const activityId = await LiveActivity.start(
        { sessionName: "Prueba Pulso", startedAt: now },
        {
          exerciseName: "Press banca",
          setLabel: "Serie 1 de 4",
          target: "40 kg, 10 repeticiones",
          setsDone: 0,
          setsTotal: 12,
          restStartedAt: now,
          restEndsAt: new Date(now.getTime() + 90_000),
          weight: "40 kg",
        },
      );
      setId(activityId);
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Panel style={{ gap: 8 }}>
      <PanelHeader title="Live Activity" trailing={`FUERZA · ${STRENGTH.activity}`} />
      <View>
        <Row label="Permitidas" value={LiveActivity.enabled() ? "Sí" : "No"} />
        <Row label="En curso" value={id ?? "—"} testID="activity-id" />
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button title="Probar" onPress={start} testID="activity-start" />
        <Button title="Terminar" onPress={() => void LiveActivity.end().then(() => setId(null))} />
        <Button title="Abrir en el Watch" onPress={() => void whenHealthAnswered(WATCH_ACCESS, () => Watch.startWatchApp()).catch((e: Error) => setNote(e.message))} />
      </View>
      {note ? (
        <Text variant="footnote" color="negative">
          {note}
        </Text>
      ) : null}
    </Panel>
  );
}
