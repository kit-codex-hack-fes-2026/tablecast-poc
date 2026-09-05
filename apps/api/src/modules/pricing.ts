import { ensure } from "../errors";
import type { Cart, CartLine, Configuration, Locale, Plan, PricedLine, Snapshot } from "../schema";

export function configurationErrors(config: Configuration): string[] {
  const errors: string[] = [];
  const unique = (ids: string[], path: string) => {
    if (new Set(ids).size !== ids.length) errors.push(`${path}: IDが重複しています`);
  };
  unique(
    config.categories.map((c) => c.id),
    "categories",
  );
  unique(
    config.products.map((p) => p.id),
    "products",
  );
  unique(
    config.plans.map((p) => p.id),
    "plans",
  );
  const categories = new Set(config.categories.map((c) => c.id));
  const products = new Set(config.products.map((p) => p.id));
  for (const product of config.products) {
    if (!categories.has(product.categoryId)) errors.push(`${product.id}: カテゴリがありません`);
    unique(
      product.modifiers.map((m) => m.id),
      product.id,
    );
    const options = product.modifiers.flatMap((m) => m.options);
    const optionIds = new Set(options.map((o) => o.id));
    unique(
      options.map((o) => o.id),
      `${product.id}.options`,
    );
    for (const group of product.modifiers) {
      if (group.min > group.max || (group.kind === "single" && group.max !== 1))
        errors.push(`${group.id}: 選択数が不正です`);
      if (
        group.max >
        group.options.reduce((sum, o) => sum + (group.kind === "quantity" ? o.maxQuantity : 1), 0)
      )
        errors.push(`${group.id}: 最大数が選択肢を超えています`);
      for (const option of group.options) {
        for (const reference of [...option.requires, ...option.excludes])
          if (!optionIds.has(reference) || reference === option.id)
            errors.push(`${option.id}: 依存先が不正です`);
      }
    }
  }
  const allOptions = new Set(
    config.products.flatMap((p) => p.modifiers.flatMap((m) => m.options.map((o) => o.id))),
  );
  for (const plan of config.plans) {
    if (plan.lastOrderMinutesBeforeEnd >= plan.durationMinutes)
      errors.push(`${plan.id}: ラストオーダーが開始以前です`);
    if (![...plan.productIds, ...plan.categoryIds, ...plan.tags].length)
      errors.push(`${plan.id}: 対象が空です`);
    for (const product of plan.productIds)
      if (!products.has(product)) errors.push(`${plan.id}: 商品がありません`);
    for (const category of plan.categoryIds)
      if (!categories.has(category)) errors.push(`${plan.id}: カテゴリがありません`);
    for (const option of plan.excludedOptionIds)
      if (!allOptions.has(option)) errors.push(`${plan.id}: 対象外選択肢がありません`);
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
