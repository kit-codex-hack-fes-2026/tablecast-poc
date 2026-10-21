import { and, eq } from "drizzle-orm";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Catalog } from "../configuration/model";
import * as business from "../../db/business-schema";
import { type PlanContext } from "../catalog/pricing";
import { catalogQuery, catalogValue, getCatalog } from "../catalog/queries";
import { planFromOrders } from "./plan";

export async function getPricingContext(
  services: ApiServices,
  row: TableRecord,
): Promise<{ catalog: Catalog; plan: null | PlanContext }> {
  const demoId = row.kind === "demo" ? row.id : undefined;
  if (!row.plan_json)
    return { catalog: await getCatalog(services, row.store_id, demoId), plan: null };
  const db = services.db;
  const [catalogs, orders] = await db.batch([
    catalogQuery(db, row.store_id, demoId),
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, row.id),
          eq(business.orders.store_id, row.store_id),
        ),
      ),
  ]);
  return { catalog: catalogValue(catalogs[0], demoId), plan: planFromOrders(row, orders) };
}
