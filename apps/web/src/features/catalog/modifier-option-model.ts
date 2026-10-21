import { type Modifier } from "@tablecast/api/schema";
import { emptyText } from "../configuration/configuration-defaults";

export function encodeEditorId(value: string) {
  return encodeURIComponent(JSON.stringify(value));
}

export function newOption(): Modifier["options"][number] {
  return {
    id: crypto.randomUUID(),
    text: emptyText(),
    priceDelta: 0,
    available: false,
    imageKey: null,
    imageKind: "illustration",
    maxQuantity: 1,
    requires: [],
    excludes: [],
  };
}
