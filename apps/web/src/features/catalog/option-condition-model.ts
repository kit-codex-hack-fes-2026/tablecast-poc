import { conditionLimits, type OptionCondition } from "@tablecast/api/schema";

export function legacyExpression(ids: string[], kind: "and" | "or"): null | OptionCondition {
  if (!ids.length) return null;
  if (ids.length === 1) return { kind: "option", optionId: ids[0] ?? "" };
  if (ids.length <= conditionLimits.children)
    return { kind, children: ids.map((optionId) => ({ kind: "option", optionId })) };
  const children: OptionCondition[] = [];
  for (let index = 0; index < ids.length; index += conditionLimits.children) {
    const child = legacyExpression(ids.slice(index, index + conditionLimits.children), kind);
    if (child) children.push(child);
  }
  // 旧配列を切り捨てず表示する。新上限を超える場合は構造エラーとして編集を求める。
  return { kind, children };
}

export const emptyLeaf = (): OptionCondition => ({ kind: "option", optionId: "" });

export type Choice = {
  allowsQuantity?: boolean;
  available: boolean;
  id: string;
  invalid: boolean;
  label: string;
  missing?: boolean;
  search: string;
};

export type NodeProps = {
  choices: Choice[];
  depth: number;
  disabled: boolean;
  invalidPaths: string[];
  node: OptionCondition;
  onChange: (node: OptionCondition) => void;
  onRemove: () => void;
  path: string;
};

export function conditionOptionChoices(
  node: OptionCondition,
  choices: Choice[],
  missingLabel: string,
) {
  const selected =
    node.kind === "option" ? choices.find((choice) => choice.id === node.optionId) : undefined;
  const missing = node.kind === "option" && !!node.optionId && !selected;
  const items =
    missing && node.kind === "option"
      ? [
          ...choices,
          {
            id: node.optionId,
            label: `${node.optionId} · ${missingLabel}`,
            search: node.optionId,
            available: false,
            invalid: true,
            missing: true,
          },
        ]
      : choices;
  return { selected, missing, items };
}
