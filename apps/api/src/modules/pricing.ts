import { ensure } from "../errors";
import type {
  Cart,
  CartLine,
  Configuration,
  ConfigurationIssue,
  Locale,
  Plan,
  PricedLine,
  Snapshot,
} from "../schema";

export function configurationErrors(config: Configuration): ConfigurationIssue[] {
  const errors: ConfigurationIssue[] = [];
  const unique = (items: { id: string }[], path: ConfigurationIssue["path"]) => {
    const seen = new Set<string>();
    for (const [index, item] of items.entries()) {
      if (seen.has(item.id))
        errors.push({
          code: "DUPLICATE_ID",
          path: [...path, index, "id"],
          params: { id: item.id },
        });
      seen.add(item.id);
    }
  };
  unique(config.categories, ["categories"]);
  unique(config.products, ["products"]);
  unique(config.plans, ["plans"]);
  const categories = new Set(config.categories.map((c) => c.id));
  const products = new Set(config.products.map((p) => p.id));
  for (const [productIndex, product] of config.products.entries()) {
    const productPath = ["products", productIndex];
    if (!categories.has(product.categoryId))
      errors.push({
        code: "CATEGORY_NOT_FOUND",
        path: [...productPath, "categoryId"],
        params: { categoryId: product.categoryId },
      });
    unique(product.modifiers, [...productPath, "modifiers"]);
    const options = product.modifiers.flatMap((m) => m.options);
    const optionIds = new Set(options.map((o) => o.id));
    const seenOptions = new Set<string>();
    for (const [groupIndex, group] of product.modifiers.entries()) {
      const groupPath = [...productPath, "modifiers", groupIndex];
      if (group.min > group.max || (group.kind === "single" && group.max !== 1))
        errors.push({
          code: "MODIFIER_SELECTION_RANGE",
          path: [...groupPath, "max"],
          params: { min: group.min, max: group.max, kind: group.kind },
        });
      const capacity = group.options.reduce(
        (sum, o) => sum + (group.kind === "quantity" ? o.maxQuantity : 1),
        0,
      );
      if (group.max > capacity)
        errors.push({
          code: "MODIFIER_CAPACITY",
          path: [...groupPath, "max"],
          params: { max: group.max, capacity },
        });
      for (const [optionIndex, option] of group.options.entries()) {
        const optionPath = [...groupPath, "options", optionIndex];
        if (seenOptions.has(option.id))
          errors.push({
            code: "DUPLICATE_ID",
            path: [...optionPath, "id"],
            params: { id: option.id },
          });
        seenOptions.add(option.id);
        for (const relation of ["requires", "excludes"] as const)
          for (const [referenceIndex, referenceId] of option[relation].entries())
            if (!optionIds.has(referenceId) || referenceId === option.id)
              errors.push({
                code: "OPTION_REFERENCE_INVALID",
                path: [...optionPath, relation, referenceIndex],
                params: { optionId: option.id, referenceId, relation },
              });
      }
    }
  }
  const allOptions = new Set(
    config.products.flatMap((p) => p.modifiers.flatMap((m) => m.options.map((o) => o.id))),
  );
  for (const [planIndex, plan] of config.plans.entries()) {
    const planPath = ["plans", planIndex];
    if (plan.lastOrderMinutesBeforeEnd >= plan.durationMinutes)
      errors.push({
        code: "PLAN_LAST_ORDER_INVALID",
        path: [...planPath, "lastOrderMinutesBeforeEnd"],
        params: {
          durationMinutes: plan.durationMinutes,
          lastOrderMinutesBeforeEnd: plan.lastOrderMinutesBeforeEnd,
        },
      });
    if (![...plan.productIds, ...plan.categoryIds, ...plan.tags].length)
      errors.push({ code: "PLAN_TARGET_EMPTY", path: planPath, params: {} });
    for (const [index, productId] of plan.productIds.entries())
      if (!products.has(productId))
        errors.push({
          code: "PRODUCT_NOT_FOUND",
          path: [...planPath, "productIds", index],
          params: { productId },
        });
    for (const [index, categoryId] of plan.categoryIds.entries())
      if (!categories.has(categoryId))
        errors.push({
          code: "CATEGORY_NOT_FOUND",
          path: [...planPath, "categoryIds", index],
          params: { categoryId },
        });
    for (const [index, optionId] of plan.excludedOptionIds.entries())
      if (!allOptions.has(optionId))
        errors.push({
          code: "OPTION_NOT_FOUND",
          path: [...planPath, "excludedOptionIds", index],
          params: { optionId },
        });
  }
  return errors;
}

export type PlanContext = {
  id: string;
  startedAt: number;
  rules: Plan;
  guestCount: number;
  orderedQuantity: number;
  lastOrderAt: number | null;
};
export function priceCart(
  config: Configuration,
  lines: CartLine[],
  version: number,
  plan?: PlanContext | null,
  now = Date.now(),
): Cart {
  ensure(new Set(lines.map((line) => line.id)).size === lines.length, "DUPLICATE_LINE", 422);
  const priced: PricedLine[] = lines.map((line) => {
    const product = config.products.find((item) => item.id === line.productId);
    ensure(product, "PRODUCT_NOT_FOUND", 422, { productId: line.productId });
    ensure(product.available, "SOLD_OUT", 422, { productId: product.id });
    ensure(
      new Set(line.selections.map((s) => s.optionId)).size === line.selections.length,
      "DUPLICATE_OPTION",
      422,
    );
    const selectedIds = new Set(line.selections.map((s) => s.optionId));
    const missing: string[] = [];
    const options: PricedLine["options"] = [];
    for (const selection of line.selections) {
      const group = product.modifiers.find((g) =>
        g.options.some((o) => o.id === selection.optionId),
      );
      const option = group?.options.find((o) => o.id === selection.optionId);
      ensure(option && group, "OPTION_NOT_FOUND", 422);
      ensure(option.available, "OPTION_SOLD_OUT", 422, { optionId: option.id });
      ensure(
        selection.quantity <= (group.kind === "quantity" ? option.maxQuantity : 1),
        "OPTION_QUANTITY",
        422,
      );
      ensure(
        option.excludes.every((other) => !selectedIds.has(other)),
        "OPTION_COMBINATION",
        422,
      );
      for (const required of option.requires)
        if (!selectedIds.has(required)) missing.push(required);
      options.push({
        id: option.id,
        name: { ja: option.text.ja.displayName, en: option.text.en.displayName },
        speechName: { ja: option.text.ja.speechName, en: option.text.en.speechName },
        quantity: selection.quantity,
        priceDelta: option.priceDelta,
      });
    }
    for (const group of product.modifiers) {
      const quantity = line.selections
        .filter((s) => group.options.some((o) => o.id === s.optionId))
        .reduce((sum, s) => sum + s.quantity, 0);
      ensure(quantity <= group.max, "TOO_MANY_OPTIONS", 422, { groupId: group.id });
      if (quantity < group.min) missing.push(group.id);
    }
    const covered =
      !!plan &&
      (plan.rules.productIds.includes(product.id) ||
        plan.rules.categoryIds.includes(product.categoryId) ||
        product.tags.some((tag) => plan.rules.tags.includes(tag)));
    if (covered && plan)
      ensure(
        !options.some((o) => plan.rules.excludedOptionIds.includes(o.id)),
        "PLAN_OPTION_EXCLUDED",
        422,
      );
    const optionPrice = options.reduce((sum, o) => sum + o.priceDelta * o.quantity, 0);
    const unitPrice =
      (covered ? 0 : product.price) +
      (covered && !plan?.rules.includedOptionSurcharge ? 0 : optionPrice);
    ensure(unitPrice >= 0, "NEGATIVE_PRICE", 422);
    return {
      ...line,
      name: { ja: product.text.ja.displayName, en: product.text.en.displayName },
      speechName: { ja: product.text.ja.speechName, en: product.text.en.speechName },
      options,
      unitPrice,
      total: unitPrice * line.quantity,
      missing: [...new Set(missing)],
      planCovered: covered,
    };
  });
  const coveredQuantity = priced
    .filter((line) => line.planCovered)
    .reduce((sum, line) => sum + line.quantity, 0);
  if (plan && coveredQuantity > 0) {
    ensure(
      now <
        plan.startedAt +
          (plan.rules.durationMinutes - plan.rules.lastOrderMinutesBeforeEnd) * 60_000,
      "PLAN_LAST_ORDER",
      422,
    );
    ensure(coveredQuantity <= plan.rules.maxPerOrder, "PLAN_ORDER_LIMIT", 422);
    ensure(
      coveredQuantity + plan.orderedQuantity <= plan.rules.maxTotalPerPerson * plan.guestCount,
      "PLAN_TOTAL_LIMIT",
      422,
    );
    ensure(
      plan.lastOrderAt === null || now >= plan.lastOrderAt + plan.rules.intervalSeconds * 1000,
      "PLAN_INTERVAL",
      422,
    );
  }
  return {
    version,
    lines: priced,
    total: priced.reduce((sum, line) => sum + line.total, 0),
    complete: priced.length > 0 && priced.every((line) => line.missing.length === 0),
  };
}

export function confirmationText(
  lines: PricedLine[],
  total: number,
  locale: Locale,
  plan: Snapshot["plan"],
): string {
  const formatted = new Intl.NumberFormat(locale === "ja" ? "ja-JP" : "en-GB");
  const items = lines
    .map((line) => {
      const options = line.options
        .map(
          (o) =>
            `${o.speechName[locale]}${o.quantity > 1 ? (locale === "ja" ? `${o.quantity}点` : ` × ${o.quantity}`) : ""}`,
        )
        .join(locale === "ja" ? "、" : ", ");
      return locale === "ja"
        ? `${line.speechName.ja}${options ? `、${options}` : ""}を${line.quantity}点、${formatted.format(line.total)}円`
        : `${line.quantity} ${line.speechName.en}${options ? ` with ${options}` : ""}, ${formatted.format(line.total)} yen`;
    })
    .join(locale === "ja" ? "。" : ". ");
  const planText = plan
    ? locale === "ja"
      ? `適用プランは${plan.name.ja}です。`
      : `Plan: ${plan.name.en}. `
    : "";
  return locale === "ja"
    ? `${items}。${planText}合計${formatted.format(total)}円です。この内容で注文を送信してよろしいですか。`
    : `${items}. ${planText}The total is ${formatted.format(total)} yen. Shall I submit this order?`;
}
