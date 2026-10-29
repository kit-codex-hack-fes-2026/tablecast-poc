import type { ConfigurationIssue } from "../configuration/model";
import type { CartLine } from "../orders/model";
import type { Product } from "./model";
import { dietaryKeys, type FoodProfile, japaneseAllergenSchema } from "./food-model";

export function productFoodErrors(
  product: Product,
  path: (number | string)[] = [],
): ConfigurationIssue[] {
  const errors: ConfigurationIssue[] = [];
  const ids = new Set<string>();
  for (const [index, component] of product.foodInfo.components.entries()) {
    if (ids.has(component.id))
      errors.push({
        code: "FOOD_COMPONENT_INVALID",
        path: [...path, "foodInfo", "components", index, "id"],
        params: { id: component.id },
      });
    ids.add(component.id);
  }
  const references = (values: string[], location: (number | string)[]) => {
    for (const [index, value] of values.entries())
      if (!ids.has(value) || values.indexOf(value) !== index)
        errors.push({
          code: "FOOD_COMPONENT_INVALID",
          path: [...location, index],
          params: { id: value },
        });
  };
  references(product.foodInfo.defaultComponentIds, [...path, "foodInfo", "defaultComponentIds"]);
  for (const [groupIndex, group] of product.modifiers.entries())
    for (const [optionIndex, option] of group.options.entries()) {
      if (!option.foodChanges) continue;
      const optionPath = [...path, "modifiers", groupIndex, "options", optionIndex, "foodChanges"];
      references(option.foodChanges.add, [...optionPath, "add"]);
      references(option.foodChanges.remove, [...optionPath, "remove"]);
      for (const id of option.foodChanges.add)
        if (option.foodChanges.remove.includes(id))
          errors.push({ code: "FOOD_COMPONENT_INVALID", path: optionPath, params: { id } });
    }
  return errors;
}

export function productFoodInformation(
  product: Product,
  selections: CartLine["selections"],
): FoodProfile {
  const selected = new Set(
    selections.filter((selection) => selection.quantity > 0).map((selection) => selection.optionId),
  );
  const changes = product.modifiers
    .flatMap((group) => group.options)
    .filter((option) => selected.has(option.id))
    .flatMap((option) => (option.foodChanges ? [option.foodChanges] : []));
  const removed = new Set(changes.flatMap((change) => change.remove));
  const active = new Set([
    ...product.foodInfo.defaultComponentIds.filter((id) => !removed.has(id)),
    ...changes.flatMap((change) => change.add),
  ]);
  const profiles = [
    product.foodInfo.base,
    ...product.foodInfo.components
      .filter((component) => active.has(component.id))
      .map((component) => component.profile),
  ];

  const result: FoodProfile = {
    allergens: {},
    crossContactSources: [...new Set(profiles.flatMap((profile) => profile.crossContactSources))],
    halalCertification: profiles.some((profile) => profile.halalCertification === "not_certified")
      ? "not_certified"
      : profiles.some((profile) => profile.halalCertification === "unknown")
        ? "unknown"
        : "certified",
    crossContact: profiles.some((profile) => profile.crossContact === "possible")
      ? "possible"
      : profiles.some((profile) => profile.crossContact === "unknown")
        ? "unknown"
        : "controlled",
    dietary: { ...product.foodInfo.base.dietary },
  };
  // 未登録は不明という公開契約を使い、各カート行へ29個のunknownを複製しない。
  for (const id of japaneseAllergenSchema.options) {
    if (profiles.some((profile) => profile.allergens[id] === "contains"))
      result.allergens[id] = "contains";
    else if (profiles.every((profile) => profile.allergens[id] === "not_used"))
      result.allergens[id] = "not_used";
  }
  for (const key of dietaryKeys) {
    const status = profiles.some((profile) => profile.dietary[key].status === "no")
      ? "no"
      : profiles.some((profile) => profile.dietary[key].status === "unknown")
        ? "unknown"
        : "yes";
    result.dietary[key] = {
      status,
      reasons: [
        ...new Set(
          profiles
            .filter((profile) => profile.dietary[key].status === status)
            .flatMap((profile) => profile.dietary[key].reasons),
        ),
      ],
    };
  }
  return result;
}

// 古い編集clientによる省略は拒否し、解除は明示した空のadd/removeで受ける。
export function losesFoodChanges(
  before: { products: Product[] },
  after: { products: Product[] },
): boolean {
  return before.products.some((product) => {
    const next = after.products.find((item) => item.id === product.id);
    if (!next) return false;
    const options = new Map(
      next.modifiers.flatMap((group) => group.options).map((option) => [option.id, option]),
    );
    return product.modifiers
      .flatMap((group) => group.options)
      .some(
        (option) =>
          option.foodChanges !== undefined &&
          options.has(option.id) &&
          options.get(option.id)?.foodChanges === undefined,
      );
  });
}
