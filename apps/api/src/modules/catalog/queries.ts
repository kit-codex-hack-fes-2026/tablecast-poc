import { observeOperation } from "../../platform/telemetry";
import { eq } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { configurationSchema, type Catalog } from "../configuration/model";
export async function getCatalog(services: ApiServices, storeId: string): Promise<Catalog> {
  return observeOperation(
    "tablecast.catalog.read",
    async () => {
      const db = services.db;

      const store = await db
        .select()
        .from(business.stores)
        .where(eq(business.stores.id, storeId))
        .get();
      ensure(store, "STORE_NOT_FOUND", 404);
      return {
        storeId: store.id,
        storeName: store.name,
        version: store.config_version,
        configuration: configurationSchema.parse(JSON.parse(store.config_json)),
      };
    },
    { env: services.env, input: { storeId } },
  );
}
