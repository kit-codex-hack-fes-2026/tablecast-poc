import type { TableState } from "../tables/model";

// GUIのイベント履歴・二言語snapshotを毎回モデルへ複製しない。
export function voiceTableState(state: TableState) {
  return {
    locale: state.locale,
    speechSpeed: state.speechSpeed,
    uiSection: state.uiSection,
    selectedProductId: state.selectedProductId,
    staffCalled: state.staffCalled,
    cart: {
      ...state.cart,
      lines: state.cart.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        quantity: line.quantity,
        selections: line.selections,
        name: line.name[state.locale],
        speechName: line.speechName[state.locale],
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
          expiresAt: state.snapshot.expiresAt,
        }
      : null,
    orders: state.orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
    })),
    bill: state.bill,
    billRequested: state.billRequested,
    plan: state.plan
      ? {
          ...state.plan,
          rules: { ...state.plan.rules, text: state.plan.rules.text[state.locale] },
        }
      : null,
  };
}
