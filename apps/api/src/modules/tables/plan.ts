import type { OrderRecord, TableRecord } from "../../db/records";
import { type PlanContext } from "../catalog/pricing";
import { type Order, snapshotSchema } from "../orders/model";
import { tablePlanSchema, type TableState } from "./model";

export function planFromOrders(
  row: TableRecord,
  orders: readonly OrderRecord[],
): null | PlanContext {
  if (!row.plan_json) return null;
  const plan = tablePlanSchema.parse(JSON.parse(row.plan_json));
  return planContext(
    plan,
    row.guest_count,
    orders
      .filter((order) => order.status !== "cancelled" && order.status !== "rejected")
      .map((order) => ({
        status: order.status,
        createdAt: order.created_at,
        snapshot: snapshotSchema.parse(JSON.parse(order.snapshot_json)),
      })),
  );
}

export function planContext(
  plan: TableState["plan"],
  guestCount: number,
  orders: readonly Pick<Order, "createdAt" | "snapshot" | "status">[],
): null | PlanContext {
  if (!plan) return null;
  let quantity = 0;
  let lastOrderAt: null | number = null;
  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "rejected") continue;
    const covered = order.snapshot.lines
      .filter((line) => line.planCovered)
      .reduce((sum, line) => sum + line.quantity, 0);
    quantity += covered;
    if (covered) lastOrderAt = Math.max(lastOrderAt ?? 0, order.createdAt);
  }
  return { ...plan, guestCount, orderedQuantity: quantity, lastOrderAt };
}
