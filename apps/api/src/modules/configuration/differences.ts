import { z } from "zod";
import { type ConfigDraft } from "./model";

function hasSensitiveField(value: unknown, path: string): boolean {
  return (
    /price|allergen|vegan|crossContact|plans|foodInfo|foodChanges|pos/.test(path) ||
    (value !== null &&
      typeof value === "object" &&
      Object.entries(value).some(([key, child]) => hasSensitiveField(child, key)))
  );
}

export function configurationDifferences(
  before: unknown,
  after: unknown,
  path = "",
): ConfigDraft["changes"] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (
    path !== "pos" &&
    !/^cast\.instructions\.(ja|en)$/.test(path) &&
    before !== null &&
    after !== null &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const left = Object.fromEntries(Object.entries(before));
    const right = Object.fromEntries(Object.entries(after));
    return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
      configurationDifferences(
        left[key] ?? null,
        right[key] ?? null,
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return [
    {
      path,
      before: z.json().parse(before ?? null),
      after: z.json().parse(after ?? null),
      sensitive: hasSensitiveField(before, path) || hasSensitiveField(after, path),
    },
  ];
}
