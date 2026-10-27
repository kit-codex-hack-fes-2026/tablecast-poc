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
