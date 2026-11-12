import { SHOPPING_CATEGORIES, SHOPPING_CATEGORY_LABELS, type ShoppingItem, type ShoppingList } from "@/contract";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Share, Switch, View } from "react-native";
import { dayKey, parseDay } from "@/dieta/model";
import { ChipPicker, FieldRow, Section, TextField } from "@/dieta/ui/forms";
import { MiniButton } from "@/dieta/ui/Meals";
import { showMenu } from "@/dieta/ui/SwipeRow";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { operationKey } from "@/data/keys";
import { useOperation } from "@/data/queries";
import { useTheme } from "@/theme";
import { Button, IconButton } from "@/ui/Button";
import { Ring } from "@/ui/Gauge";
import { haptics } from "@/ui/haptics";
import { Icon, type SFSymbol } from "@/ui/Icon";
import { Panel, PanelHeader } from "@/ui/Panel";
import { Screen } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { Sheet } from "@/ui/Sheet";
import { EmptyState, ErrorState, LoadingState } from "@/ui/States";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";

type Category = (typeof SHOPPING_CATEGORIES)[number];
const ICONS: Record<Category, SFSymbol> = {
  frutas_verduras: "carrot",
  carnes_pescados: "fish",
  lacteos_huevos: "cup.and.saucer",
  panaderia_cereales: "birthday.cake",
  despensa: "archivebox",
  bebidas: "waterbottle",
  congelados: "snowflake",
  otros: "bag",
};
type Draft = { id?: string; name: string; amount: string; category: Category | null; note: string; pantry: boolean };

/** «Lista de compras»: what the plan asks for the next days, by aisle; bought, «Ya tengo», by hand (ShoppingListView.swift). */
export default function Compras() {
  const { colors } = useTheme();
  const toast = useToast();
  const queries = useQueryClient();
  const list = useOperation("view_shopping_list", {});
  const { run } = useAction();
  const [days, setDays] = useState<"3" | "7" | "14">("7");
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const data = list.data;
  const key = operationKey("view_shopping_list", {});

  useEffect(() => {
    if (data?.days && [3, 7, 14].includes(data.days)) setDays(String(data.days) as "3" | "7" | "14");
  }, [data?.days]);

  const put = (next: ShoppingList) => queries.setQueryData(key, next);
  /** Optimistic: the change shows at once and rolls back if the Mac says no. */
  const patch = async (item: ShoppingItem, change: Partial<Pick<ShoppingItem, "checked" | "pantry">>) => {
    if (!data) return;
    const before = data;
    const fixed = { ...change, ...(change.checked ? { pantry: false } : {}), ...(change.pantry ? { checked: false } : {}) };
    put({ ...data, items: data.items.map((i) => (i.id === item.id ? { ...i, ...fixed } : i)) });
    haptics.select();
    try {
      put(await run("edit_shopping_item", { id: item.id, ...fixed }, { refresh: false }));
    } catch (error) {
      put(before);
      toast.show({ message: describeError(error), tone: "error" });
    }
  };
  const remove = async (item: ShoppingItem) => {
    if (!data) return;
    const before = data;
    put({ ...data, items: data.items.filter((i) => i.id !== item.id) });
    try {
      put(await run("delete_shopping_item", { id: item.id }, { refresh: false }));
    } catch (error) {
      put(before);
      toast.show({ message: describeError(error), tone: "error" });
    }
  };
  const generate = async () => {
    setGenerating(true);
    try {
      put(await run("build_shopping_list", { days: Number(days), from: dayKey() }));
      haptics.success();
    } catch (error) {
      toast.show({ message: describeError(error), tone: "error" });
    } finally {
      setGenerating(false);
    }
  };
  const save = async (d: Draft) => {
    setDraft(null);
    const body = { name: d.name.trim(), amount: d.amount.trim() || null, note: d.note.trim() || null };
    try {
      put(
        d.id
          ? await run("edit_shopping_item", { id: d.id, ...body, ...(d.category && { category: d.category }), pantry: d.pantry }, { refresh: false })
          : await run("create_shopping_item", { ...body, ...(d.category && { category: d.category }) }, { refresh: false }),
      );
    } catch (error) {
      toast.show({ message: describeError(error), tone: "error" });
    }
  };

  const items = data?.items ?? [];
  const toBuy = items.filter((i) => !i.pantry);
  const bought = toBuy.filter((i) => i.checked).length;
  const pending = toBuy.length - bought;
  const pantry = items.filter((i) => i.pantry);
  const range = data?.from && data.to ? `${parseDay(data.from).getDate()} – ${parseDay(data.to).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : null;

  useEffect(() => {
    if (toBuy.length > 0 && pending === 0) haptics.success();
  }, [pending, toBuy.length]);

  const menu = (item: ShoppingItem) =>
    showMenu(
      [
        { title: item.checked ? "Desmarcar" : "Comprado", onPress: () => void patch(item, { checked: !item.checked }) },
        { title: item.pantry ? "Lo necesito" : "Ya tengo", onPress: () => void patch(item, { pantry: !item.pantry }) },
        { title: "Editar", onPress: () => setDraft({ id: item.id, name: item.name, amount: item.amount ?? "", category: item.category, note: item.note ?? "", pantry: item.pantry }) },
        { title: "Eliminar", destructive: true, onPress: () => void remove(item) },
      ],
      item.name,
    );

  const rangeCard = (title: string) => (
    <Panel style={{ gap: 10 }}>
      <PanelHeader title={title} trailing="Desde tu plan" />
      <Segmented
        options={[
          { value: "3", label: "3 días" },
          { value: "7", label: "7 días" },
          { value: "14", label: "14 días" },
        ]}
        value={days}
        onChange={setDays}
      />
      <Button title={items.length ? "Regenerar" : "Generar lista"} icon="wand.and.stars" variant="accent" busy={generating} onPress={generate} wide />
      <Text variant="footnote" color="textSecondary">
        Lo que marcaste y lo que añadiste a mano se quedan.
      </Text>
    </Panel>
  );

  return (
    <Screen
      title="Lista de compras"
      leading={<IconButton icon="chevron.left" size={28} accessibilityLabel="Atrás" onPress={() => router.back()} />}
      accessory={
        <View style={{ flexDirection: "row", gap: 6 }}>
          {pending > 0 && data ? <IconButton icon="square.and.arrow.up" size={28} accessibilityLabel="Compartir" onPress={() => void Share.share({ message: data.text, title: "Lista de compras" })} /> : null}
          <IconButton icon="plus" size={28} accessibilityLabel="Añadir" onPress={() => data && setDraft({ name: "", amount: "", category: null, note: "", pantry: false })} testID="shopping-add" />
        </View>
      }
      refreshing={list.isRefetching}
      onRefresh={() => void list.refetch()}
    >
      {list.isError && !data ? (
        <ErrorState title="Sin conexión" message="No se pudo cargar tu lista." onRetry={() => void list.refetch()} />
      ) : !data ? (
        <LoadingState lines={4} />
      ) : !items.length ? (
        data.hasPlan ? (
          <>
            <EmptyState icon="cart" title="Genera tu lista desde tu plan" message="Lo que pide tu plan para los próximos días, por pasillo." bare />
            {rangeCard("Generar lista")}
          </>
        ) : (
          <EmptyState
            icon="cart"
            title="Genera tu lista desde tu plan"
            message="Aún no tienes un plan de dieta activo. Créalo en pulso.bixku.online y la lista sale de ahí."
            secondary={{ title: "Añadir algo a mano", onPress: () => setDraft({ name: "", amount: "", category: null, note: "", pantry: false }) }}
          />
        )
      ) : (
        <>
          <Panel style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Ring size={64} stroke={7} progress={toBuy.length ? bought / toBuy.length : 0} color={colors.accent}>
              <Icon name={pending === 0 ? "checkmark" : "basket"} size={18} color="accentText" />
            </Ring>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" color="textSecondary">
                Comprados
              </Text>
              <Text variant="stat">
                {bought}
                <Text variant="labelSmall" color="textSecondary">
                  {" "}
                  de {toBuy.length}
                </Text>
              </Text>
              <Text variant="meta" color="textSecondary">
                {[pending === 0 ? "¡Todo listo!" : `Te faltan ${pending}`, range].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </Panel>
          {data.stale && data.hasPlan ? (
            <Panel style={{ gap: 8, borderColor: colors.warning }}>
              <Text variant="rowTitle">Tu plan de dieta cambió</Text>
              <Text variant="footnote" color="textSecondary">
                Actualiza la lista: lo que marcaste y lo que añadiste a mano se queda.
              </Text>
              <MiniButton accent icon="arrow.clockwise" title="Actualizar lista" onPress={generate} />
            </Panel>
          ) : null}
          {SHOPPING_CATEGORIES.map((c) => {
            const rows = toBuy.filter((i) => i.category === c);
            if (!rows.length) return null;
            return (
              <Panel key={c} style={{ paddingVertical: 8 }}>
                <PanelHeader
                  title={
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                      <Icon name={ICONS[c]} size={12} color="accentText" />
                      <Text variant="label" color="textSecondary">
                        {SHOPPING_CATEGORY_LABELS[c]}
                      </Text>
                    </View>
                  }
                  trailing={`${rows.filter((r) => r.checked).length}/${rows.length}`}
                />
                {rows.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => void patch(item, { checked: !item.checked })}
                    onLongPress={() => menu(item)}
                    accessibilityValue={{ text: item.checked ? "Comprado" : "Pendiente" }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, borderTopWidth: 1, borderTopColor: colors.separator }}
                    testID={`shop-${item.name}`}
                  >
                    <Icon name={item.checked ? "checkmark.circle.fill" : "circle"} size={18} tint={item.checked ? colors.accentText : colors.textTertiary} />
                    <View style={{ flex: 1 }}>
                      <Text variant="subhead" color={item.checked ? "textSecondary" : "text"} style={item.checked ? { textDecorationLine: "line-through" } : undefined}>
                        {item.name}
                      </Text>
                      {item.note ? (
                        <Text variant="caption" color="textSecondary" numberOfLines={1}>
                          {item.note}
                        </Text>
                      ) : null}
                    </View>
                    {item.amount ? (
                      <Text variant="meta" color="textSecondary">
                        {item.amount}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </Panel>
            );
          })}
          {pantry.length ? (
            <Panel style={{ paddingVertical: 8 }}>
              <PanelHeader title="Ya tengo" />
              {pantry.map((item) => (
                <Pressable key={item.id} onLongPress={() => menu(item)} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 46, borderTopWidth: 1, borderTopColor: colors.separator }}>
                  <Icon name="house" size={14} color="textSecondary" />
                  <Text variant="subhead" color="textSecondary" style={{ flex: 1 }}>
                    {item.name}
                  </Text>
                  <MiniButton title="Lo necesito" onPress={() => void patch(item, { pantry: false })} />
                </Pressable>
              ))}
            </Panel>
          ) : null}
          {data.hasPlan ? rangeCard("Regenerar") : null}
        </>
      )}
      <ItemEditor draft={draft} onClose={() => setDraft(null)} onSave={save} onDelete={(id) => (setDraft(null), void remove(items.find((i) => i.id === id)!))} />
    </Screen>
  );
}

function ItemEditor({ draft, onClose, onSave, onDelete }: { draft: Draft | null; onClose: () => void; onSave: (d: Draft) => void; onDelete: (id: string) => void }) {
  const [d, setD] = useState<Draft | null>(draft);
  useEffect(() => setD(draft), [draft]);
  return (
    <Sheet visible={!!draft} onClose={onClose} title={draft?.id ? "Editar" : "Añadir a la lista"}>
      {d ? (
        <View style={{ gap: 12 }}>
          <Section>
            <TextField value={d.name} onChange={(name) => setD({ ...d, name })} placeholder="Qué" autoFocus={!d.id} testID="shop-name" />
          </Section>
          <Section>
            <TextField value={d.amount} onChange={(amount) => setD({ ...d, amount })} placeholder="Cantidad (opcional)" />
          </Section>
          <Section title="Pasillo">
            <View style={{ paddingVertical: 8 }}>
              <ChipPicker<Category | "auto">
                options={[...(d.id ? [] : [{ value: "auto" as const, label: "Automático" }]), ...SHOPPING_CATEGORIES.map((c) => ({ value: c, label: SHOPPING_CATEGORY_LABELS[c], icon: ICONS[c] }))]}
                value={d.category ?? "auto"}
                onChange={(v) => setD({ ...d, category: v === "auto" ? null : v })}
              />
            </View>
          </Section>
          <Section>
            <TextField value={d.note} onChange={(note) => setD({ ...d, note })} placeholder="Nota" multiline />
          </Section>
          {d.id ? (
            <Section>
              <FieldRow label="Ya lo tengo" last>
                <Switch value={d.pantry} onValueChange={(pantry) => setD({ ...d, pantry })} />
              </FieldRow>
            </Section>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {d.id ? <Button title="Eliminar" icon="trash" onPress={() => onDelete(d.id!)} /> : null}
            <View style={{ flex: 1 }}>
              <Button title="Guardar" variant="accent" wide disabled={!d.name.trim()} onPress={() => onSave(d)} testID="shop-save" />
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
