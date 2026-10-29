import type { Configuration } from "../configuration/model";
import type { Order } from "../orders/model";
import type { TableState } from "../tables/model";
import type { PosInvoice, PosIssue, PosMapping } from "./model";
import { ensure } from "../../platform/errors";
import { mapLocalized, resolveLocalized } from "../catalog/localization";

type InvoiceTable = Pick<
  TableState,
  "bill" | "cart" | "guestCount" | "id" | "locale" | "plan" | "status" | "storeId"
>;

export function buildPosInvoice(input: {
  adjustments: { amount: number; id: string; reason: string }[];
  configurations: Map<number, Configuration>;
  mappings: PosMapping[];
  orders: Order[];
  table: InvoiceTable;
}): { invoice: PosInvoice; issues: PosIssue[] } {
  const { table, orders, configurations, mappings, adjustments } = input;
  const issues: PosIssue[] = [];
  const mappingIds = { product: new Map<string, string>(), option: new Map<string, string>() };
  for (const mapping of mappings) {
    ensure(!mappingIds[mapping.kind].has(mapping.localId), "POS_INVALID_INPUT", 422);
    mappingIds[mapping.kind].set(mapping.localId, mapping.externalId);
  }
  ensure(new Set(orders.map((order) => order.id)).size === orders.length, "POS_INVALID_INPUT", 422);
  ensure(
    new Set(adjustments.map((row) => row.id)).size === adjustments.length,
    "POS_INVALID_INPUT",
    422,
  );
  if (table.cart.lines.length) issues.push({ code: "POS_CART_NOT_EMPTY" });
  if (table.bill.paidTotal !== 0) issues.push({ code: "POS_ALREADY_PAID" });
  if (table.status === "closed") issues.push({ code: "POS_SESSION_CLOSED" });

  const catalogs = new Map<number, Map<string, Configuration["products"][number]>>();
  const lines: PosInvoice["lines"] = [];
  let amountsMatch = true;
  for (const order of orders) {
    ensure(
      order.tableSessionId === table.id && order.snapshot.tableSessionId === table.id,
      "POS_INVALID_INPUT",
      422,
    );
    if (order.status === "cancelled" || order.status === "rejected") continue;
    if (order.status !== "served" && !issues.some((issue) => issue.code === "POS_ORDERS_PENDING"))
      issues.push({ code: "POS_ORDERS_PENDING" });
    const snapshot = order.snapshot;
    let products = catalogs.get(snapshot.configVersion);
    if (!products) {
      const configuration = configurations.get(snapshot.configVersion);
      ensure(configuration, "POS_INVALID_INPUT", 422);
      products = new Map(configuration.products.map((product) => [product.id, product]));
      ensure(products.size === configuration.products.length, "POS_INVALID_INPUT", 422);
      catalogs.set(snapshot.configVersion, products);
    }
    ensure(
      new Set(snapshot.lines.map((line) => line.id)).size === snapshot.lines.length,
      "POS_INVALID_INPUT",
      422,
    );
    let orderTotal = 0;
    for (const line of snapshot.lines) {
      const product = products.get(line.productId);
      ensure(product, "POS_INVALID_INPUT", 422);
      const sourceOptions = product.modifiers.flatMap((modifier) => modifier.options);
      ensure(
        new Set(sourceOptions.map((option) => option.id)).size === sourceOptions.length,
        "POS_INVALID_INPUT",
        422,
      );
      ensure(
        new Set(line.options.map((option) => option.id)).size === line.options.length,
        "POS_INVALID_INPUT",
        422,
      );
      const externalId = mappingIds.product.get(line.productId) ?? null;
      if (externalId === null)
        issues.push({
          code: "POS_MAPPING_REQUIRED",
          localId: line.productId,
          name: resolveLocalized(line.name, table.locale),
        });
      const options = line.options.map((option) => {
        const source = sourceOptions.find((candidate) => candidate.id === option.id);
        ensure(source, "POS_INVALID_INPUT", 422);
        const mapped = mappingIds.option.get(option.id) ?? null;
        if (mapped === null)
          issues.push({
            code: "POS_MAPPING_REQUIRED",
            localId: option.id,
            name: resolveLocalized(option.name, table.locale),
          });
        return {
          id: option.id,
          externalId: mapped,
          name: resolveLocalized(option.name, table.locale),
          displayName: option.name,
          quantity: option.quantity,
          price:
            line.planCovered && !table.plan?.rules.includedOptionSurcharge ? 0 : option.priceDelta,
          referencePrice: source.priceDelta,
        };
      });
      const optionTotal = options.reduce((sum, option) => sum + option.price * option.quantity, 0);
      const unitPrice = line.planCovered ? 0 : line.unitPrice - optionTotal;
      ensure(Number.isSafeInteger(unitPrice) && unitPrice >= 0, "POS_INVALID_INPUT", 422);
      amountsMatch &&= (unitPrice + optionTotal) * line.quantity === line.total;
      orderTotal += line.total;
      lines.push({
        id: `${order.id}:${line.id}`,
        productId: line.productId,
        externalId,
        name: resolveLocalized(line.name, table.locale),
        displayName: line.name,
        transliteration: line.transliteration,
        quantity: line.quantity,
        unitPrice,
        referencePrice: product.price,
        options,
        total: line.total,
      });
    }
    amountsMatch &&= orderTotal === order.total && orderTotal === snapshot.total;
  }
  if (table.plan) {
    lines.push({
      id: `plan:${table.plan.id}`,
      productId: null,
      externalId: null,
      name: resolveLocalized(table.plan.rules.text, table.locale).displayName,
      displayName: mapLocalized(table.plan.rules.text, (value) => value.displayName),
      quantity: table.guestCount,
      unitPrice: table.plan.rules.pricePerPerson,
      referencePrice: table.plan.rules.pricePerPerson,
      options: [],
      total: table.bill.planTotal,
    });
    amountsMatch &&= table.plan.rules.pricePerPerson * table.guestCount === table.bill.planTotal;
  }
  ensure(new Set(lines.map((line) => line.id)).size === lines.length, "POS_INVALID_INPUT", 422);
  const invoice: PosInvoice = {
    id: table.id,
    storeId: table.storeId,
    sessionId: table.id,
    version: table.cart.version,
    currency: "JPY",
    total: table.bill.due,
    lines,
    adjustments: adjustments.map((row) => ({ id: row.id, name: row.reason, amount: row.amount })),
  };
  const expected =
    lines.reduce((sum, line) => sum + line.total, 0) +
    adjustments.reduce((sum, row) => sum + row.amount, 0);
  if (!amountsMatch || expected !== invoice.total)
    issues.push({ code: "POS_TOTAL_MISMATCH", expected, actual: invoice.total });
  if (!lines.length && !adjustments.some((row) => row.amount !== 0))
    issues.push({ code: "POS_ZERO_OR_EMPTY" });
  if (lines.length > 500) issues.push({ code: "POS_UNSUPPORTED" });
  return { invoice, issues };
}
