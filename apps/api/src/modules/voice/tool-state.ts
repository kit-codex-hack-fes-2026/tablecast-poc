import type { Locale } from "../../platform/model";
import type { Product } from "../catalog/model";
import type { DisplayCurrencyCode, ExchangeRates } from "../currency/model";
import type { TableState } from "../tables/model";
import { approximateAmounts, currencyMetadata } from "../currency/display";
import { showProductsSchema } from "./model";

// GUIのイベント履歴・二言語snapshotを毎回モデルへ複製しない。
export function voiceTableState(
  state: TableState,
  currency: DisplayCurrencyCode | null = null,
  rates?: ExchangeRates,
) {
  const displayed = showProductsSchema.shape.productIds.safeParse(
    state.events.findLast((event) => event.kind === "voice.products")?.data.productIds,
  );
  return {
    displayCurrency: currencyMetadata(currency, rates),
    locale: state.locale,
    speechSpeed: state.speechSpeed,
    uiSection: state.uiSection,
    selectedProductId: state.selectedProductId,
    menuSearch: state.menuSearch,
    displayedProductIds: displayed.success ? displayed.data : [],
    staffCalled: state.staffCalled,
    cart: {
      ...state.cart,
      ...approximateAmounts({ total: state.cart.total }, currency, rates),
      lines: state.cart.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        quantity: line.quantity,
        selections: line.selections,
        name: line.name[state.locale],
        speechName: line.speechName[state.locale],
        ...approximateAmounts({ unitPrice: line.unitPrice, total: line.total }, currency, rates),
        unitPrice: line.unitPrice,
        total: line.total,
        missing: line.missing,
        ...(line.conditionIssues?.length
          ? {
              conditionIssues: line.conditionIssues.map(({ optionId, relation }) => ({
                optionId,
                relation,
              })),
            }
          : {}),
        planCovered: line.planCovered,
        options: line.options.map((option) => ({
          id: option.id,
          name: option.name[state.locale],
          quantity: option.quantity,
          priceDelta: option.priceDelta,
          ...approximateAmounts({ priceDelta: option.priceDelta }, currency, rates),
        })),
      })),
    },
    snapshot: state.snapshot
      ? {
          id: state.snapshot.id,
          status: state.snapshot.status,
          cartVersion: state.snapshot.cartVersion,
          text: state.snapshot.text,
          total: state.snapshot.total,
          ...approximateAmounts({ total: state.snapshot.total }, currency, rates),
          expiresAt: state.snapshot.expiresAt,
        }
      : null,
    orders: state.orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
      ...approximateAmounts({ total: order.total }, currency, rates),
    })),
    bill: {
      ...state.bill,
      ...approximateAmounts(
        {
          orderedTotal: state.bill.orderedTotal,
          planTotal: state.bill.planTotal,
          adjustmentTotal: state.bill.adjustmentTotal,
          paidTotal: state.bill.paidTotal,
          due: state.bill.due,
          cartTotal: state.bill.cartTotal,
        },
        currency,
        rates,
      ),
    },
    billRequested: state.billRequested,
    plan: state.plan
      ? {
          ...state.plan,
          rules: {
            ...state.plan.rules,
            text: state.plan.rules.text[state.locale],
            ...approximateAmounts(
              { pricePerPerson: state.plan.rules.pricePerPerson },
              currency,
              rates,
            ),
          },
        }
      : null,
  };
}

// 検索照会と検索画面の案内で、同じ商品概要・必須選択を返す。
export function voiceCatalogProduct(
  product: Product,
  locale: Locale,
  currency: DisplayCurrencyCode | null,
  rates: ExchangeRates | undefined,
  detail: boolean,
) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    price: product.price,
    ...approximateAmounts({ price: product.price }, currency, rates),
    available: product.available,
    displayName: product.text[locale].displayName,
    speechName: product.text[locale].speechName,
    description: product.text[locale].description,
    requiredSelections:
      product.modifiers
        ?.filter((modifier) => modifier.min > 0)
        .map((modifier) => ({
          id: modifier.id,
          displayName: modifier.text[locale].displayName,
          min: modifier.min,
          max: modifier.max,
        })) ?? [],
    ...(detail
      ? {
          foodInfo: product.foodInfo,
          modifiers: product.modifiers?.map((modifier) => ({
            id: modifier.id,
            kind: modifier.kind,
            min: modifier.min,
            max: modifier.max,
            displayName: modifier.text[locale].displayName,
            speechName: modifier.text[locale].speechName,
            description: modifier.text[locale].description,
            options: modifier.options.map((option) => ({
              id: option.id,
              priceDelta: option.priceDelta,
              ...approximateAmounts({ priceDelta: option.priceDelta }, currency, rates),
              available: option.available,
              foodChanges: option.foodChanges,
              maxQuantity: option.maxQuantity,
              ...(option.conditions
                ? { conditions: option.conditions }
                : { requires: option.requires, excludes: option.excludes }),
              displayName: option.text[locale].displayName,
              speechName: option.text[locale].speechName,
              description: option.text[locale].description,
            })),
          })),
        }
      : {}),
  };
}
