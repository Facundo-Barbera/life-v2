import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { amountText, int, UNIT_LABEL } from "@/dieta/model";
import { MacroLine } from "@/dieta/ui/forms";
import { MiniButton } from "@/dieta/ui/Meals";
import { useAction } from "@/data/actions";
import { describeError } from "@/data/errors";
import { useOperation } from "@/data/queries";
import { IconButton } from "@/ui/Button";
import { Hairline, Panel, PanelHeader } from "@/ui/Panel";
import { ErrorState, LoadingState } from "@/ui/States";
import { Screen } from "@/ui/Screen";
import { Text } from "@/ui/Text";
import { useToast } from "@/ui/Toast";

/** A plan recipe: time, portions, ingredients and steps; «Guardar como platillo» keeps one portion (RecipeDetailView.swift). */
export default function Receta() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useOperation("get_recipe", { id });
  const { run } = useAction();
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const r = recipe.data?.recipe;
  return (
    <Screen
      title={r?.name ?? "Receta"}
      leading={<IconButton icon="chevron.left" size={28} accessibilityLabel="Atrás" onPress={() => router.back()} />}
      accessory={
        r ? (
          <MiniButton
            icon={saved ? "bookmark.fill" : "bookmark"}
            title={saved ? "En Mis platillos" : "Guardar como platillo"}
            onPress={
              saved
                ? undefined
                : async () => {
                    try {
                      await run("create_saved_dish", { recipeId: r.id });
                      setSaved(true);
                    } catch (error) {
                      toast.show({ message: describeError(error), tone: "error" });
                    }
                  }
            }
          />
        ) : undefined
      }
      refreshing={recipe.isRefetching}
      onRefresh={() => void recipe.refetch()}
    >
      {recipe.isError ? (
        <ErrorState title="No se pudo abrir la receta" message="Revisa tu conexión." onRetry={() => void recipe.refetch()} />
      ) : !r ? (
        <LoadingState lines={4} />
      ) : (
        <>
          <Panel style={{ gap: 6 }}>
            <PanelHeader title={r.prepMinutes <= 15 ? "Receta rápida" : "Receta"} trailing={`${r.servings} porci${r.servings === 1 ? "ón" : "ones"}`} />
            <Text variant="hero">
              {int(r.prepMinutes)}
              <Text variant="label" color="textSecondary">
                {" "}
                min
              </Text>
            </Text>
            <Text variant="headline">{r.name}</Text>
            <Text variant="meta" color="textSecondary">
              {int(r.perServing.kcal)} kcal por porción
            </Text>
            <MacroLine {...r.perServing} />
            {r.batch ? (
              <Text variant="meta" color="accentText">
                Aguanta varios días
              </Text>
            ) : null}
          </Panel>
          <Panel style={{ gap: 8 }}>
            <PanelHeader title={`Ingredientes · para ${r.servings} porci${r.servings === 1 ? "ón" : "ones"}`} />
            {r.ingredients.map((i, n) => (
              <View key={n} style={{ gap: 8 }}>
                {n ? <Hairline /> : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text variant="subhead" style={{ flex: 1 }}>
                    {i.name}
                  </Text>
                  <Text variant="meta" color="textSecondary">
                    {i.unit in UNIT_LABEL ? `${String(i.quantity).replace(".", ",")} ${UNIT_LABEL[i.unit][i.quantity === 1 ? 0 : 1]}` : amountText({ quantity: i.quantity, unit: "g", measure: null })}
                  </Text>
                </View>
              </View>
            ))}
          </Panel>
          {r.steps ? (
            <Panel style={{ gap: 8 }}>
              <PanelHeader title="Cómo se hace" />
              <Text variant="body">{r.steps}</Text>
            </Panel>
          ) : null}
        </>
      )}
    </Screen>
  );
}
