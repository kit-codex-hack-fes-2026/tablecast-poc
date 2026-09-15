import type { Configuration, ConfigurationIssue } from "../configuration/model";
import type { OptionCondition, Product } from "./model";

export function evaluateCondition(
  condition: OptionCondition,
  selected: ReadonlySet<string>,
): boolean {
  switch (condition.kind) {
    case "option":
      return selected.has(condition.optionId);
    case "and":
      return condition.children.every((child) => evaluateCondition(child, selected));
    case "or":
      return condition.children.some((child) => evaluateCondition(child, selected));
    case "not":
      return !evaluateCondition(condition.child, selected);
    default: {
      const unreachable: never = condition;
      return unreachable;
    }
  }
}

export function conditionReferences(
  condition: OptionCondition,
  path: (string | number)[] = [],
): { optionId: string; path: (string | number)[] }[] {
  if (condition.kind === "option")
    return [{ optionId: condition.optionId, path: [...path, "optionId"] }];
  if (condition.kind === "not") return conditionReferences(condition.child, [...path, "child"]);
  return condition.children.flatMap((child, index) =>
    conditionReferences(child, [...path, "children", index]),
  );
}

export function productConditionErrors(
  product: Product,
  path: (string | number)[] = [],
): ConfigurationIssue[] {
  const ids = new Set(
    product.modifiers.flatMap((group) => group.options.map((option) => option.id)),
  );
  return product.modifiers.flatMap((group, groupIndex) =>
    group.options.flatMap((option, optionIndex) =>
      (["requires", "excludes"] as const).flatMap((relation) => {
        const expression = option.conditions?.[relation];
        return expression
          ? conditionReferences(expression).flatMap((reference): ConfigurationIssue[] =>
              !ids.has(reference.optionId) || reference.optionId === option.id
                ? [
                    {
                      code: "OPTION_REFERENCE_INVALID",
                      path: [
                        ...path,
                        "modifiers",
                        groupIndex,
                        "options",
                        optionIndex,
                        "conditions",
                        relation,
                        ...reference.path,
                      ],
                      params: { optionId: option.id, referenceId: reference.optionId, relation },
                    },
                  ]
                : [],
            )
          : [];
      }),
    ),
  );
}

// option自体の削除と、旧クライアントによる条件フィールドの消失を区別する。
export function losesConditions(before: Configuration, after: Configuration): boolean {
  const products = new Map(after.products.map((product) => [product.id, product]));
  return before.products.some((product) => {
    const next = products.get(product.id);
    if (!next) return false;
    const options = new Map(
      next.modifiers.flatMap((group) =>
        group.options.map((option) => [option.id, option] as const),
      ),
    );
    return product.modifiers.some((group) =>
      group.options.some(
        (option) =>
          option.conditions !== undefined &&
          options.has(option.id) &&
          options.get(option.id)?.conditions === undefined,
      ),
    );
  });
}
