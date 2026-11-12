/**
 * Shopping (Pulso's Lista de compras): Pulso's `@pulso/contract` `shopping.ts`
 * with the same type names, as zod where an operation answers with it.
 *
 * Two kinds of operations: the Coach's tools (compact, model-shaped answers,
 * same names as in Pulso) and what the iPhone called under
 * `/api/mobile/shopping/*` (the whole ShoppingList, the names at the end).
 */
import { z } from "zod";
import { op } from "./operation";

/** Shopping list: what to buy for the coming days of the active diet plan, plus the person's own items. */

/** Supermarket aisles, in the order the list shows them. */
export const SHOPPING_CATEGORIES = [
  "frutas_verduras",
  "carnes_pescados",
  "lacteos_huevos",
  "panaderia_cereales",
  "despensa",
  "bebidas",
  "congelados",
  "otros",
] as const;
export type ShoppingCategory = (typeof SHOPPING_CATEGORIES)[number];

export const SHOPPING_CATEGORY_LABELS: Record<ShoppingCategory, string> = {
  frutas_verduras: "Frutas y verduras",
  carnes_pescados: "Carnes y pescados",
  lacteos_huevos: "Lácteos y huevos",
  panaderia_cereales: "Panadería y cereales",
  despensa: "Despensa",
  bebidas: "Bebidas",
  congelados: "Congelados",
  otros: "Otros",
};

/** How many days a list can cover. The phone offers 3, 7 and 14. */
export const SHOPPING_MAX_DAYS = 14;

export const ShoppingItem = z.object({
  id: z.string(),
  name: z.string(),
  /** What to buy, as shown: "1,4 kg", "2 L", "12", "3 latas". Null for a manual item without one. */
  amount: z.string().nullable(),
  /** What the plan needs before rounding to a buyable amount, in `unit`. Null for manual items. */
  quantity: z.number().nullable(),
  /** `g`, `ml`, `ud` (units/servings) or the plan's own unit when it can't be converted (e.g. `taza`). */
  unit: z.string().nullable(),
  category: z.enum(SHOPPING_CATEGORIES),
  source: z.enum(["plan", "manual"]),
  /** Bought. */
  checked: z.boolean(),
  /** "Ya tengo": already at home, not needed this time. Not counted in the progress. */
  pantry: z.boolean(),
  note: z.string().nullable(),
  updatedAt: z.number(),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

export const ShoppingList = z.object({
  /** The range the plan items cover (local dates, inclusive). Null until generated. */
  from: z.string().nullable(),
  to: z.string().nullable(),
  days: z.number().nullable(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  generatedAt: z.number().nullable(),
  /** True when there is an active plan to generate from. */
  hasPlan: z.boolean(),
  /** True when the active plan is not the one the list was generated from. */
  stale: z.boolean(),
  /** Sorted by aisle, then name. */
  items: z.array(ShoppingItem),
  /** Bought items, and items to buy («Ya tengo» excluded). */
  done: z.number(),
  total: z.number(),
  /** The items still to buy as plain text, grouped by aisle, to send to someone. */
  text: z.string(),
});
export type ShoppingList = z.infer<typeof ShoppingList>;

export type ShoppingGenerateInput = { days?: number; from?: string };

export type ShoppingItemInput = { name: string; amount?: string | null; category?: ShoppingCategory; note?: string | null };

export type ShoppingItemPatch = Partial<Pick<ShoppingItem, "name" | "amount" | "category" | "checked" | "pantry" | "note">>;

/** Pulso's shopping operations (its Coach tools), at `/api/v1/salud/shopping/<operation>`; the engine runs those tools for them (`salud/api/tools.ts`). */
export const shoppingOperations = {
  generate_shopping_list: op({
    name: "generate_shopping_list",
    description: "Build the shopping list from the active plan's meals still to eat (and batches to cook) for `days` from `from` (local YYYY-MM-DD, default today), per ingredient, in buyable amounts. The same range keeps manual items and the bought / 'ya tengo' marks still needed; a new start date is a new trip (marks reset). Plan changes rebuild it by themselves. Returns one line per item («id · name · amount · category · 'a mano' if added by hand · comprado · ya tengo · «note»»), progress = bought/to buy («ya tengo» excluded), stale.",
    access: "write",
    method: "POST",
    path: "/shopping/generate_shopping_list",
    input: z.object({ days: z.int().min(1).max(14).default(7), from: z.string().regex(new RegExp("^\\d{4}-\\d{2}-\\d{2}$")).optional() }),
    output: z.unknown(),
  }),
  get_shopping_list: op({
    name: "get_shopping_list",
    description: "The current shopping list. stale = true when the active plan changed since it was generated (offer to regenerate). Returns one line per item («id · name · amount · category · 'a mano' if added by hand · comprado · ya tengo · «note»»), progress = bought/to buy («ya tengo» excluded), stale.",
    access: "read",
    method: "GET",
    path: "/shopping/get_shopping_list",
    input: z.object({}),
    output: z.unknown(),
  }),
  add_shopping_items: op({
    name: "add_shopping_items",
    description: "Add items not in the plan ('apunta papel de cocina'). amount is Spanish free text ('2 kg'); category is guessed when omitted. Returns the items it touched, as get_shopping_list lines, and the progress.",
    access: "write",
    method: "POST",
    path: "/shopping/add_shopping_items",
    input: z.object({ items: z.array(z.object({ name: z.string().min(1).max(80), amount: z.string().max(30).nullable().optional(), category: z.enum(["frutas_verduras","carnes_pescados","lacteos_huevos","panaderia_cereales","despensa","bebidas","congelados","otros"]).nullable().optional(), note: z.string().max(200).nullable().optional() })).min(1).max(50) }),
    output: z.unknown(),
  }),
  update_shopping_item: op({
    name: "update_shopping_item",
    description: "Change one item by id, only the fields given; pantry true = 'ya tengo' (they have it at home). Returns the items it touched, as get_shopping_list lines, and the progress.",
    access: "write",
    method: "POST",
    path: "/shopping/update_shopping_item",
    input: z.object({ id: z.string(), name: z.string().min(1).max(80).optional(), amount: z.string().max(30).nullable().optional(), category: z.enum(["frutas_verduras","carnes_pescados","lacteos_huevos","panaderia_cereales","despensa","bebidas","congelados","otros"]).optional(), checked: z.boolean().optional(), pantry: z.boolean().optional(), note: z.string().max(200).nullable().optional() }),
    output: z.unknown(),
  }),
  check_shopping_items: op({
    name: "check_shopping_items",
    description: "Mark items bought (checked true) or back to pending (false). Returns the items it touched, as get_shopping_list lines, and the progress.",
    access: "write",
    method: "POST",
    path: "/shopping/check_shopping_items",
    input: z.object({ ids: z.array(z.string()).min(1).max(200), checked: z.boolean().default(true) }),
    output: z.unknown(),
  }),
  remove_shopping_items: op({
    name: "remove_shopping_items",
    description: "Delete items by id. For a plan ingredient they already have, prefer pantry true (update_shopping_item): a regeneration brings deleted plan items back. Returns the items it touched, as get_shopping_list lines, and the progress.",
    access: "write",
    method: "POST",
    path: "/shopping/remove_shopping_items",
    input: z.object({ ids: z.array(z.string()).min(1).max(200) }),
    output: z.unknown(),
  }),

  // ── What the iPhone's Lista de compras calls (Pulso's /api/mobile/shopping/*): each answers the whole list ──
  // Events are `shopping.<operation>`, as the Coach tools' writes publish them.
  view_shopping_list: op({
    name: "view_shopping_list",
    description: "The phone's shopping list in full: its range and plan, every item (sorted by aisle, then name) with amount, quantity, unit, category, source (plan/manual), checked (bought), pantry («ya tengo») and note, the progress (done/total, «ya tengo» excluded), stale, hasPlan and the text to share. For a model, get_shopping_list is shorter.",
    access: "read",
    method: "GET",
    path: "/shopping",
    input: z.object({}),
    output: ShoppingList,
  }),
  build_shopping_list: op({
    name: "build_shopping_list",
    description: "Build the list from the active diet plan for `days` days from `from` (the phone's local today), as generate_shopping_list does. 409 no_plan without an active plan. Returns the whole list.",
    access: "write",
    method: "POST",
    path: "/shopping/generate",
    input: z.object({ days: z.int().min(1).max(SHOPPING_MAX_DAYS).default(7), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").optional() }),
    output: ShoppingList,
    event: "shopping.build_shopping_list",
  }),
  create_shopping_item: op({
    name: "create_shopping_item",
    description: "Add one item of the person's own (amount is free text, '2 kg'; the aisle is guessed from the name when omitted). Returns the whole list.",
    access: "write",
    method: "POST",
    path: "/shopping/items",
    input: z.object({ name: z.string().min(1).max(80), amount: z.string().max(30).nullish(), category: z.enum(SHOPPING_CATEGORIES).nullish(), note: z.string().max(200).nullish() }),
    output: ShoppingList,
    event: "shopping.create_shopping_item",
  }),
  edit_shopping_item: op({
    name: "edit_shopping_item",
    description: "Change one item by id, only the fields given: checked = bought, pantry = «ya tengo» (setting one clears the other). Returns the whole list.",
    access: "write",
    method: "PATCH",
    path: "/shopping/items/{id}",
    input: z.object({
      id: z.string(),
      name: z.string().min(1).max(80).optional(),
      amount: z.string().max(30).nullish(),
      category: z.enum(SHOPPING_CATEGORIES).optional(),
      checked: z.boolean().optional(),
      pantry: z.boolean().optional(),
      note: z.string().max(200).nullish(),
    }),
    output: ShoppingList,
    event: "shopping.edit_shopping_item",
  }),
  delete_shopping_item: op({
    name: "delete_shopping_item",
    description: "Delete one item by id (a regeneration brings a deleted plan item back; pantry true keeps it out). Returns the whole list without it.",
    access: "write",
    method: "DELETE",
    path: "/shopping/items/{id}",
    input: z.object({ id: z.string() }),
    output: ShoppingList,
    event: "shopping.delete_shopping_item",
  }),
};
