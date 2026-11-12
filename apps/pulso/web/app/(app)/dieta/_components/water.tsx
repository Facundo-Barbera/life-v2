"use client";
import { ActionForm, Submit } from "@/components/client";
import { addWaterFormAction } from "../actions";

export function WaterCustom({ date }: { date: string }) {
  return (
    <ActionForm action={addWaterFormAction} className="row">
      <input type="hidden" name="date" value={date} />
      <input className="input num-input" name="ml" inputMode="numeric" placeholder="ml" style={{ width: 76, minHeight: 28, padding: "4px 8px" }} required />
      <Submit className="btn sm">+</Submit>
    </ActionForm>
  );
}
