import type { z } from "zod";
import type { Actor } from "../auth/model";
import type { OptionCondition } from "../catalog/model";
import { DomainError, ensure } from "../../platform/errors";
import { requireManager } from "../auth/policy";
import { evaluateCondition, productConditionErrors } from "../catalog/conditions";
import { priceCart } from "../catalog/pricing";
import { type conditionPreviewSchema } from "./model";

export function previewConditions(actor: Actor, input: z.infer<typeof conditionPreviewSchema>) {
  requireManager(actor);
  const errors = productConditionErrors(input.product);
  const option = input.product.modifiers
    .flatMap((group) => group.options)
    .find((item) => item.id === input.optionId);
  ensure(option, "OPTION_NOT_FOUND", 422);
  const selected = new Set(input.selections.map((selection) => selection.optionId));
  const applied = selected.has(option.id);
  const nodes = (
    expression: OptionCondition,
    path: (number | string)[] = [],
  ): { matched: boolean; path: (number | string)[] }[] => [
    { path, matched: evaluateCondition(expression, selected) },
    ...(expression.kind === "not"
      ? nodes(expression.child, [...path, "child"])
      : expression.kind === "option"
        ? []
        : expression.children.flatMap((child, index) =>
            nodes(child, [...path, "children", index]),
          )),
  ];
  let selectionError: null | string = null;
  try {
    const cart = priceCart(
      { products: [input.product] },
      [
        {
          id: "tablecast-condition-preview",
          productId: input.product.id,
          quantity: 1,
          selections: input.selections,
        },
      ],
      0,
    );
    if (!cart.complete) selectionError = "CART_INCOMPLETE";
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    selectionError = error.code;
  }
  return {
    errors,
    selectionError,
    applied,
    conditions: (["requires", "excludes"] as const).map((relation) => {
      const expression = option.conditions?.[relation];
      const matched = expression
        ? evaluateCondition(expression, selected)
        : relation === "requires"
          ? option.requires.every((id) => selected.has(id))
          : option.excludes.some((id) => selected.has(id));
      return {
        relation,
        matched,
        satisfied: !applied || (relation === "requires" ? matched : !matched),
        nodes: expression ? nodes(expression) : [],
      };
    }),
  };
}
