import { type Square, SquareClient, SquareEnvironment, SquareError } from "square";
import type { PosAdapter, PosRemoteCheckout, PosRemoteOrder, PosRemotePayment } from "./adapter";
import type {
  PosCapabilities,
  PosCatalog,
  PosCatalogItem,
  PosDevice,
  PosDeviceCode,
  PosInvoice,
  PosIssue,
} from "./model";
import { DomainError, ensure } from "../../platform/errors";

export const squareCapabilities: PosCapabilities = {
  catalog: true,
  quote: true,
  orderExport: true,
  checkout: true,
  cancel: true,
};

const squareSandboxDeviceId = "9fa747a2-25ff-48ee-b078-04381f7c828f";

const squareScopes = [
  "DEVICE_CREDENTIAL_MANAGEMENT",
  "ITEMS_READ",
  "MERCHANT_PROFILE_READ",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
];

type SquareOptions = { environment?: "production" | "sandbox"; fetch?: typeof fetch };

function client(accessToken?: string, options?: SquareOptions) {
  const { environment = "production", ...transport } = options ?? {};
  return new SquareClient({
    token: accessToken,
    auth: accessToken ? undefined : false,
    environment:
      environment === "sandbox" ? SquareEnvironment.Sandbox : SquareEnvironment.Production,
    version: "2026-09-16",
    maxRetries: 0,
    timeoutInSeconds: 15,
    ...transport,
  });
}

async function request<T>(run: () => PromiseLike<T>, mutation = false): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError && !(mutation && error.code === "POS_PROVIDER_UNAVAILABLE"))
      throw error;
    if (error instanceof SquareError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        throw new DomainError("POS_AUTH_REQUIRED", 401, "Squareへの再接続が必要です");
      }
      if (
        error.statusCode &&
        error.statusCode >= 400 &&
        error.statusCode < 500 &&
        error.statusCode !== 429
      ) {
        throw new DomainError("POS_UNSUPPORTED", 422, "Squareでこの操作を実行できません");
      }
      if (error.statusCode === 429) {
        throw new DomainError("POS_PROVIDER_UNAVAILABLE", 503, "Squareへ接続できません");
      }
    }
    throw new DomainError(
      mutation ? "POS_UNKNOWN_OUTCOME" : "POS_PROVIDER_UNAVAILABLE",
      mutation ? 409 : 503,
      mutation ? "Squareの処理結果を確認してください" : "Squareへ接続できません",
    );
  }
}

function money(value: number): Square.Money {
  ensure(Number.isSafeInteger(value), "POS_UNSUPPORTED", 422);
  return { amount: BigInt(value), currency: "JPY" };
}

function amount(value: Square.Money | undefined): number {
  ensure(value?.amount !== undefined, "POS_PROVIDER_UNAVAILABLE", 503);
  const result = Number(value.amount);
  ensure(Number.isSafeInteger(result), "POS_PROVIDER_UNAVAILABLE", 503);
  return result;
}

function remoteOrder(order: Square.Order | undefined): PosRemoteOrder {
  ensure(order?.id, "POS_UNKNOWN_OUTCOME", 409);
  return {
    id: order.id,
    locationId: order.locationId,
    amount: amount(order.totalMoney),
    currency: order.totalMoney?.currency ?? "",
    status:
      order.state === "OPEN"
        ? "open"
        : order.state === "COMPLETED"
          ? "completed"
          : order.state === "CANCELED"
            ? "cancelled"
            : "unknown",
    paymentIds: (order.tenders ?? []).flatMap((tender) => tender.paymentId ?? tender.id ?? []),
  };
}

function remoteCheckout(checkout: Square.TerminalCheckout | undefined): PosRemoteCheckout {
  ensure(checkout?.id, "POS_UNKNOWN_OUTCOME", 409);
  return {
    id: checkout.id,
    orderId: checkout.orderId ?? "",
    locationId: checkout.locationId ?? "",
    amount: amount(checkout.amountMoney),
    currency: checkout.amountMoney.currency ?? "",
    // タイムアウトと決済の競合ではCANCELEDの後にCOMPLETEDへ変わるため、再決済を解放しない。
    status:
      checkout.status === "COMPLETED"
        ? "completed"
        : checkout.status === "CANCELED"
          ? checkout.cancelReason === "TIMED_OUT"
            ? "unknown"
            : "cancelled"
          : ["PENDING", "IN_PROGRESS", "CANCEL_REQUESTED"].includes(checkout.status ?? "")
            ? "pending"
            : "unknown",
    paymentIds: checkout.paymentIds ?? [],
  };
}

function deviceCode(value: Square.DeviceCode | undefined): PosDeviceCode {
  const expiresAt = Date.parse(value?.pairBy ?? "");
  ensure(value?.id && Number.isFinite(expiresAt), "POS_PROVIDER_UNAVAILABLE", 503);
  return {
    id: value.id,
    code: value.code ?? "",
    deviceId: value.deviceId ?? null,
    expiresAt,
    status:
      value.status === "PAIRED"
        ? "paired"
        : value.status === "EXPIRED"
          ? "expired"
          : value.status === "UNPAIRED"
            ? "pending"
            : "unknown",
  };
}

function present(object: Square.CatalogObject, locationId: string) {
  return (
    !object.isDeleted &&
    (object.presentAtAllLocations !== false
      ? !object.absentAtLocationIds?.includes(locationId)
      : Boolean(object.presentAtLocationIds?.includes(locationId)))
  );
}

function catalogMoney(value: Square.Money | undefined) {
  return value?.currency === "JPY" &&
    value.amount !== undefined &&
    Number.isSafeInteger(Number(value.amount))
    ? Number(value.amount)
    : null;
}

function catalogObjects(objects: Square.CatalogObject[]) {
  const byId = new Map<string, Square.CatalogObject>();
  for (const object of objects) if (object.id) byId.set(object.id, object);
  for (const object of objects) {
    const children =
      object.type === "ITEM"
        ? object.itemData?.variations
        : object.type === "MODIFIER_LIST"
          ? object.modifierListData?.modifiers
          : [];
    for (const child of children ?? []) if (child.id) byId.set(child.id, child);
  }
  return byId;
}

function catalogItems(
  byId: Map<string, Square.CatalogObject>,
  locationId: string,
): PosCatalogItem[] {
  const modifiersByList = new Map<string, Square.CatalogObject.Modifier[]>();
  for (const object of byId.values()) {
    if (object.type !== "MODIFIER" || !object.modifierData?.modifierListId) continue;
    const listId = object.modifierData.modifierListId;
    const modifiers = modifiersByList.get(listId) ?? [];
    modifiers.push(object);
    modifiersByList.set(listId, modifiers);
  }
  return [...byId.values()].flatMap((variation) => {
    if (variation.type !== "ITEM_VARIATION" || !variation.itemVariationData) return [];
    const data = variation.itemVariationData;
    const item = byId.get(data.itemId ?? "");
    if (
      item?.type !== "ITEM" ||
      !item.itemData ||
      !present(item, locationId) ||
      item.itemData.isArchived ||
      !present(variation, locationId)
    )
      return [];
    const override = data.locationOverrides?.find((entry) => entry.locationId === locationId);
    const price =
      (override?.pricingType ?? data.pricingType) === "VARIABLE_PRICING"
        ? null
        : catalogMoney(override?.priceMoney ?? data.priceMoney);
    const options = (item.itemData.modifierListInfo ?? []).flatMap((info) => {
      const list = byId.get(info.modifierListId);
      if (
        info.enabled === false ||
        list?.type !== "MODIFIER_LIST" ||
        !list.modifierListData ||
        !present(list, locationId) ||
        list.modifierListData.modifierType === "TEXT"
      )
        return [];
      return (modifiersByList.get(list.id) ?? []).flatMap((modifier) => {
        if (!modifier.modifierData || !present(modifier, locationId)) return [];
        const location = modifier.modifierData.locationOverrides?.find(
          (entry) => entry.locationId === locationId,
        );
        const modifierPrice = catalogMoney(
          location?.priceMoney ?? modifier.modifierData.priceMoney,
        );
        if (modifierPrice === null) return [];
        return [
          {
            id: modifier.id,
            name: modifier.modifierData.name ?? modifier.id,
            price: modifierPrice,
            available: !location?.soldOut,
          },
        ];
      });
    });
    return [
      {
        id: variation.id,
        name: [item.itemData.name ?? item.id, data.name].filter(Boolean).join(" / "),
        price,
        available: data.sellable !== false && !override?.soldOut && price !== null,
        options,
      },
    ];
  });
}

function validateTaxes(
  invoice: PosInvoice,
  byId: Map<string, Square.CatalogObject>,
  locationId: string,
) {
  const taxes = [...byId.values()].filter(
    (object) =>
      object.type === "TAX" && present(object, locationId) && object.taxData?.enabled !== false,
  );
  const supported = (tax: Square.CatalogObject | undefined) =>
    tax?.type === "TAX" &&
    present(tax, locationId) &&
    tax.taxData?.enabled === true &&
    tax.taxData.inclusionType === "INCLUSIVE" &&
    /^\d+(?:\.\d+)?$/u.test(tax.taxData.percentage ?? "") &&
    Number(tax.taxData.percentage) === 10 &&
    tax.taxData.calculationPhase === "TAX_SUBTOTAL_PHASE" &&
    !tax.taxData.appliesToProductSetId;
  const customTaxes = taxes.filter(
    (tax) => tax.type === "TAX" && tax.taxData?.appliesToCustomAmounts !== false,
  );
  const customSupported = customTaxes.length === 1 && supported(customTaxes[0]);
  // 商品集合の条件を解釈せず、適用範囲が不明な税を固定税率で上書きしない。
  const productSetTax = taxes.some(
    (tax) => tax.type === "TAX" && tax.taxData?.appliesToProductSetId,
  );
  const issues: PosIssue[] = [];
  for (const line of invoice.lines) {
    const variation = byId.get(line.externalId ?? "");
    const item =
      variation?.type === "ITEM_VARIATION"
        ? byId.get(variation.itemVariationData?.itemId ?? "")
        : undefined;
    const taxIds = item?.type === "ITEM" ? [...new Set(item.itemData?.taxIds ?? [])] : [];
    const valid = line.externalId
      ? !productSetTax &&
        item?.type === "ITEM" &&
        item.itemData?.isTaxable !== false &&
        taxIds.length === 1 &&
        supported(byId.get(taxIds[0] ?? ""))
      : customSupported;
    if (!valid)
      issues.push({ code: "POS_UNSUPPORTED", localId: line.productId ?? line.id, name: line.name });
  }
  for (const adjustment of invoice.adjustments) {
    if (adjustment.amount > 0 && !customSupported)
      issues.push({ code: "POS_UNSUPPORTED", localId: adjustment.id, name: adjustment.name });
  }
  if (issues.length)
    throw new DomainError(
      "POS_UNSUPPORTED",
      422,
      "Squareの商品と追加料金に税込10%の税を設定してください",
      issues,
    );
}

function validateCatalog(invoice: PosInvoice, catalog: PosCatalog) {
  const products = new Map(catalog.items.map((item) => [item.id, item]));
  const issues: PosIssue[] = [];
  for (const line of invoice.lines) {
    if (!line.productId && !line.externalId) continue;
    const product = products.get(line.externalId ?? "");
    const issue = { localId: line.productId ?? line.id, name: line.name };
    if (!line.externalId) issues.push({ ...issue, code: "POS_MAPPING_REQUIRED" });
    else if (!product) issues.push({ ...issue, code: "POS_PRODUCT_UNAVAILABLE" });
    else {
      if (product.price === null) issues.push({ ...issue, code: "POS_UNSUPPORTED" });
      else if (product.price !== line.referencePrice)
        issues.push({
          ...issue,
          code: "POS_PRICE_MISMATCH",
          expected: line.referencePrice,
          actual: product.price,
        });
      if (!product.available) issues.push({ ...issue, code: "POS_PRODUCT_UNAVAILABLE" });
    }
    const options = new Map(product?.options.map((option) => [option.id, option]));
    for (const selected of line.options) {
      const option = options.get(selected.externalId ?? "");
      const detail = { localId: selected.id, name: selected.name };
      if (!selected.externalId) issues.push({ ...detail, code: "POS_MAPPING_REQUIRED" });
      else if (!option || !option.available)
        issues.push({ ...detail, code: "POS_PRODUCT_UNAVAILABLE" });
      if (option && option.price !== selected.referencePrice)
        issues.push({
          ...detail,
          code: "POS_PRICE_MISMATCH",
          expected: selected.referencePrice,
          actual: option.price,
        });
    }
  }
  const unique = [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()];
  if (unique.length)
    throw new DomainError(
      unique[0]?.code ?? "POS_UNSUPPORTED",
      409,
      "Squareの商品対応と価格を確認してください",
      unique,
    );
}

// 最大剰余法で円未満を配賦し、割引総額と各行の非負を保つ。
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((result, value) => result + BigInt(value), 0n);
  ensure(total >= 0 && BigInt(total) <= sum, "POS_UNSUPPORTED", 422);
  if (!total) return weights.map(() => 0);
  const parts = weights.map((weight, index) => ({
    index,
    value: Number((BigInt(total) * BigInt(weight)) / sum),
    remainder: (BigInt(total) * BigInt(weight)) % sum,
  }));
  let rest = total - parts.reduce((result, part) => result + part.value, 0);
  for (const part of parts.toSorted((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  )) {
    if (rest-- > 0) part.value += 1;
  }
  return parts.map((part) => part.value);
}

function squareOrder(invoice: PosInvoice, locationId: string): Square.Order {
  const discounts: Square.OrderLineItemDiscount[] = [];
  const rows = invoice.lines.map((line, index) => {
    ensure(!line.productId || line.externalId, "POS_UNSUPPORTED", 422);
    for (const option of line.options) ensure(option.externalId, "POS_UNSUPPORTED", 422);
    const gross =
      (line.unitPrice +
        line.options.reduce(
          (sum, option) => sum + Math.max(0, option.price) * option.quantity,
          0,
        )) *
      line.quantity;
    const net =
      (line.unitPrice +
        line.options.reduce((sum, option) => sum + option.price * option.quantity, 0)) *
      line.quantity;
    ensure(
      Number.isSafeInteger(gross) && gross >= line.total && net === line.total,
      "POS_UNSUPPORTED",
      422,
    );
    const notes = line.options
      .filter((option) => option.price < 0)
      .map((option) => `${option.name}: ${option.price}円 × ${option.quantity}（商品1点当たり）`);
    return {
      gross,
      net: line.total,
      discount: gross - line.total,
      notes,
      line: {
        uid: `line-${index}`,
        name: line.name,
        quantity: String(line.quantity),
        catalogObjectId: line.externalId ?? undefined,
        basePriceMoney: money(line.unitPrice),
        modifiers: line.options.map((option, optionIndex) => ({
          uid: `option-${index}-${optionIndex}`,
          catalogObjectId: option.externalId ?? undefined,
          name: option.name,
          quantity: String(option.quantity),
          basePriceMoney: money(Math.max(0, option.price)),
        })),
      } satisfies Square.OrderLineItem,
    };
  });
  for (const adjustment of invoice.adjustments.filter((entry) => entry.amount > 0)) {
    rows.push({
      gross: adjustment.amount,
      net: adjustment.amount,
      discount: 0,
      notes: [],
      line: {
        uid: `adjustment-${rows.length}`,
        name: adjustment.name,
        quantity: "1",
        basePriceMoney: money(adjustment.amount),
        modifiers: [],
        catalogObjectId: undefined,
      },
    });
  }
  const subtotal = rows.reduce((sum, row) => sum + row.net, 0);
  let remaining = rows.map((row) => row.net);
  for (const adjustment of invoice.adjustments.filter((entry) => entry.amount < 0)) {
    const shares = apportion(-adjustment.amount, remaining);
    remaining = remaining.map((weight, index) => weight - (shares[index] ?? 0));
    for (const [index, row] of rows.entries()) {
      const share = shares[index] ?? 0;
      row.discount += share;
      if (share)
        row.notes.push(`${adjustment.name}: -${share}円（会計全体 ${adjustment.amount}円）`);
    }
  }
  ensure(
    subtotal +
      invoice.adjustments
        .filter((entry) => entry.amount < 0)
        .reduce((sum, entry) => sum + entry.amount, 0) ===
      invoice.total,
    "POS_UNSUPPORTED",
    422,
  );
  const lineItems = rows.map((row, index): Square.OrderLineItem => {
    const note = row.notes.join("\n");
    ensure(note.length <= 2000, "POS_UNSUPPORTED", 422);
    if (!row.discount) return { ...row.line, note: note || undefined };
    const uid = `discount-${index}`;
    discounts.push({
      uid,
      name: "TableCast値引き",
      type: "FIXED_AMOUNT",
      scope: "LINE_ITEM",
      amountMoney: money(row.discount),
    });
    return { ...row.line, note: note || undefined, appliedDiscounts: [{ discountUid: uid }] };
  });
  return {
    locationId,
    referenceId: invoice.id,
    lineItems,
    discounts,
    metadata: { tablecast_invoice_id: invoice.id },
    taxes: [
      {
        uid: "tablecast-tax-10",
        name: "消費税10%",
        percentage: "10",
        type: "INCLUSIVE",
        scope: "ORDER",
      },
    ],
    pricingOptions: { autoApplyDiscounts: false, autoApplyTaxes: false },
  };
}

export function createSquareAdapter(
  accessToken: string,
  options?: SquareOptions,
): Required<PosAdapter> {
  const square = client(accessToken, options);
  const getOrder = async (id: string) =>
    request(async () => {
      const result = await square.orders.get({ orderId: id });
      ensure(result.order, "POS_PROVIDER_UNAVAILABLE", 503);
      return result.order;
    });
  const loadCatalog = (locationId?: string) =>
    request(async () => {
      const locationsResponse = await square.locations.list();
      const locations = (locationsResponse.locations ?? []).filter(
        (location) => location.status === "ACTIVE" && location.currency === "JPY" && location.id,
      );
      if (locationId)
        ensure(
          locations.some((location) => location.id === locationId),
          "POS_UNSUPPORTED",
          422,
        );
      const objects = await square.catalog.list({
        types: "ITEM,ITEM_VARIATION,MODIFIER_LIST,MODIFIER,TAX",
      });
      const all: Square.CatalogObject[] = [];
      for await (const object of objects) all.push(object);
      const byId = catalogObjects(all);
      return {
        byId,
        view: {
          locations: locations.flatMap((location) =>
            location.id ? [{ id: location.id, name: location.name ?? location.id }] : [],
          ),
          items: locationId ? catalogItems(byId, locationId) : [],
          issues: [],
        } satisfies PosCatalog,
      };
    });
  return {
    capabilities: squareCapabilities,
    catalog: async (locationId) => (await loadCatalog(locationId)).view,
    devices: {
      list: (locationId) =>
        request(async () => {
          if (options?.environment === "sandbox")
            return [{ id: squareSandboxDeviceId, name: "レジ端末", locationId }];
          const codes = await square.devices.codes.list({
            locationId,
            productType: "TERMINAL_API",
            status: "PAIRED",
          });
          const devices = new Map<string, PosDevice>();
          for await (const code of codes) {
            if (
              code.status !== "PAIRED" ||
              code.productType !== "TERMINAL_API" ||
              code.locationId !== locationId ||
              !code.deviceId
            )
              continue;
            devices.set(code.deviceId, {
              id: code.deviceId,
              name: code.name ?? code.deviceId,
              locationId,
            });
          }
          return [...devices.values()];
        }),
      createCode: (locationId, name, key) =>
        request(async () => {
          ensure(options?.environment !== "sandbox", "POS_UNSUPPORTED", 422);
          return deviceCode(
            (
              await square.devices.codes.create({
                idempotencyKey: key,
                deviceCode: { locationId, name, productType: "TERMINAL_API" },
              })
            ).deviceCode,
          );
        }, true),
      getCode: (id) =>
        request(async () => {
          ensure(options?.environment !== "sandbox", "POS_UNSUPPORTED", 422);
          return deviceCode((await square.devices.codes.get({ id })).deviceCode);
        }),
    },
    quote: (invoice, locationId) =>
      request(async () => {
        const order = squareOrder(invoice, locationId);
        const catalog = await loadCatalog(locationId);
        validateCatalog(invoice, catalog.view);
        if (options?.environment !== "sandbox") validateTaxes(invoice, catalog.byId, locationId);
        const result = await square.orders.calculate({ order });
        return {
          amount: amount(result.order?.totalMoney),
          currency: result.order?.totalMoney?.currency ?? "",
        };
      }),
    createOrder: (invoice, locationId, key) =>
      request(async () => {
        let response: Square.CreateOrderResponse;
        try {
          response = await square.orders.create({
            order: squareOrder(invoice, locationId),
            idempotencyKey: key,
          });
        } catch (error) {
          if (!(error instanceof SquareError)) throw error;
          const rejected =
            [400, 401, 403, 404, 422, 429].includes(error.statusCode ?? 0) &&
            error.errors.length > 0 &&
            error.errors.every(
              (entry) =>
                ["AUTHENTICATION_ERROR", "INVALID_REQUEST_ERROR", "RATE_LIMIT_ERROR"].includes(
                  entry.category,
                ) &&
                ![
                  "IDEMPOTENCY_KEY_REUSED",
                  "CONFLICT",
                  "REQUEST_TIMEOUT",
                  "TEMPORARY_ERROR",
                ].includes(entry.code),
            );
          if (rejected)
            throw new DomainError(
              "POS_ORDER_REJECTED",
              error.statusCode === 401 || error.statusCode === 403
                ? 401
                : error.statusCode === 429
                  ? 503
                  : 422,
              "Squareが注文の作成を受け付けませんでした",
            );
          throw new DomainError("POS_UNKNOWN_OUTCOME", 409, "Squareの処理結果を確認してください");
        }
        return remoteOrder(response.order);
      }, true),
    getOrder: async (id) => remoteOrder(await getOrder(id)),
    settleZeroOrder: async (id, key) => {
      const order = await getOrder(id);
      ensure(
        amount(order.totalMoney) === 0 &&
          order.totalMoney?.currency === "JPY" &&
          !order.tenders?.length,
        "POS_UNSUPPORTED",
        422,
      );
      if (order.state === "COMPLETED") return remoteOrder(order);
      ensure(order.state === "OPEN" && order.version !== undefined, "POS_UNSUPPORTED", 422);
      return request(
        async () =>
          remoteOrder(
            (
              await square.orders.pay({
                orderId: id,
                idempotencyKey: key,
                orderVersion: order.version,
                paymentIds: [],
              })
            ).order,
          ),
        true,
      );
    },
    cancelOrder: async (id) => {
      const order = await getOrder(id);
      if (order.state === "CANCELED") return remoteOrder(order);
      ensure(
        order.state === "OPEN" && !order.tenders?.length && order.version !== undefined,
        "POS_UNKNOWN_OUTCOME",
        409,
      );
      return request(
        async () =>
          remoteOrder(
            (
              await square.orders.update({
                orderId: id,
                order: { locationId: order.locationId, version: order.version, state: "CANCELED" },
                idempotencyKey: `tablecast-cancel-${id}-${order.version}`,
              })
            ).order,
          ),
        true,
      );
    },
    checkout: {
      start: (order, deviceId, key) =>
        request(async () => {
          ensure(order.amount > 0 && order.currency === "JPY", "POS_UNSUPPORTED", 422);
          return remoteCheckout(
            (
              await square.terminal.checkouts.create({
                idempotencyKey: key,
                checkout: {
                  orderId: order.id,
                  referenceId: order.id,
                  amountMoney: money(order.amount),
                  paymentType: "CARD_PRESENT",
                  paymentOptions: { autocomplete: true },
                  deviceOptions: {
                    deviceId,
                    allowAutoCardSurcharge: false,
                    showItemizedCart: true,
                    tipSettings: { allowTipping: false },
                  },
                },
              })
            ).checkout,
          );
        }, true),
      get: (id) =>
        request(async () =>
          remoteCheckout((await square.terminal.checkouts.get({ checkoutId: id })).checkout),
        ),
      cancel: (id) =>
        request(
          async () =>
            remoteCheckout((await square.terminal.checkouts.cancel({ checkoutId: id })).checkout),
          true,
        ),
    },
    getPayment: (id) =>
      request(async (): Promise<PosRemotePayment> => {
        const payment = (await square.payments.get({ paymentId: id })).payment;
        ensure(payment?.id, "POS_PROVIDER_UNAVAILABLE", 503);
        return {
          id: payment.id,
          orderId: payment.orderId ?? "",
          locationId: payment.locationId ?? "",
          checkoutId: payment.terminalCheckoutId ?? null,
          amount: amount(payment.amountMoney),
          currency: payment.amountMoney?.currency ?? "",
          completed:
            payment.status === "COMPLETED" &&
            (!payment.refundedMoney || amount(payment.refundedMoney) === 0) &&
            (!payment.tipMoney || amount(payment.tipMoney) === 0) &&
            (!payment.totalMoney ||
              (payment.totalMoney.currency === payment.amountMoney?.currency &&
                amount(payment.totalMoney) === amount(payment.amountMoney))) &&
            (!payment.cardDetails?.appliedCardSurchargeDetails?.cardSurchargeMoney ||
              amount(payment.cardDetails.appliedCardSurchargeDetails.cardSurchargeMoney) === 0),
        };
      }),
  };
}

export function squareAuthorizationUrl(
  applicationId: string,
  state: string,
  redirectUri: string,
  options?: SquareOptions,
) {
  const sandbox = options?.environment === "sandbox";
  const url = new URL(
    sandbox
      ? "https://connect.squareupsandbox.com/oauth2/authorize"
      : "https://connect.squareup.com/oauth2/authorize",
  );
  url.search = new URLSearchParams({
    client_id: applicationId,
    state,
    redirect_uri: redirectUri,
    scope: squareScopes.join(" "),
    ...(!sandbox ? { session: "false" } : {}),
  }).toString();
  return url.toString();
}

export async function exchangeSquareToken(
  input: {
    applicationId: string;
    applicationSecret: string;
    code?: string;
    redirectUri?: string;
    refreshToken?: string;
  },
  options?: SquareOptions,
) {
  return request(async () => {
    const result = await client(undefined, options).oAuth.obtainToken({
      clientId: input.applicationId,
      clientSecret: input.applicationSecret,
      code: input.code,
      refreshToken: input.refreshToken,
      redirectUri: input.redirectUri,
      grantType: input.refreshToken ? "refresh_token" : "authorization_code",
    });
    const expiresAt = Date.parse(result.expiresAt ?? "");
    ensure(
      result.accessToken && result.refreshToken && result.merchantId && Number.isFinite(expiresAt),
      "POS_PROVIDER_UNAVAILABLE",
      503,
    );
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      merchantId: result.merchantId,
      expiresAt,
    };
  });
}

export async function revokeSquareToken(
  applicationId: string,
  applicationSecret: string,
  accessToken: string,
  options?: SquareOptions,
): Promise<void> {
  await request(async () => {
    const result = await client(undefined, options).oAuth.revokeToken(
      { clientId: applicationId, accessToken, revokeOnlyAccessToken: true },
      { headers: { Authorization: `Client ${applicationSecret}` } },
    );
    ensure(result.success, "POS_PROVIDER_UNAVAILABLE", 503);
  });
}

export async function verifySquareWebhook(
  body: string,
  signature: string,
  notificationUrl: string,
  key: string,
): Promise<boolean> {
  if (!signature || !key || !notificationUrl) return false;
  try {
    const bytes = Uint8Array.from(atob(signature), (character) => character.charCodeAt(0));
    if (bytes.length !== 32) return false;
    const encoder = new TextEncoder();
    const hmac = await crypto.subtle.importKey(
      "raw",
      encoder.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify("HMAC", hmac, bytes, encoder.encode(notificationUrl + body));
  } catch {
    return false;
  }
}
