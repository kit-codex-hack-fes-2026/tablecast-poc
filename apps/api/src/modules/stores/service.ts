import { eq } from "drizzle-orm";
import * as authTables from "../../db/auth-schema";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { configurationSchema } from "../configuration/model";
import { saveIdentityImage } from "../media/service";
import type { CreateStore } from "./model";
export async function createStore(services: ApiServices, userId: string, input: CreateStore) {
  const id = crypto.randomUUID(),
    now = Date.now();
  const configuration = configurationSchema.parse({
    categories: [],
    products: [],
    plans: [],
    cast: { instructions: { ja: "", en: "" }, voice: { ja: null, en: null }, proactive: false },
  });
  const json = JSON.stringify(configuration),
    db = services.db;
  ensure(
    !(await db
      .select({ id: authTables.organization.id })
      .from(authTables.organization)
      .where(eq(authTables.organization.slug, input.slug))
      .get()),
    "STORE_SLUG_TAKEN",
    409,
  );
  await db.batch([
    db.insert(authTables.organization).values({
      id,
      name: input.name,
      slug: input.slug,
      createdAt: new Date(now),
    }),
    db.insert(authTables.member).values({
      id: crypto.randomUUID(),
      organizationId: id,
      userId,
      role: "owner",
      createdAt: new Date(now),
    }),
    db.insert(business.stores).values({
      id,
      organization_id: id,
      name: input.name,
      config_json: json,
      updated_at: now,
    }),
    db.insert(business.configReleases).values({
      store_id: id,
      version: 1,
      config_json: json,
      published_by: userId,
      created_at: now,
    }),
    ...Array.from({ length: input.tableCount }, (_, index) =>
      db.insert(business.restaurantTables).values({
        id: crypto.randomUUID(),
        store_id: id,
        name: `T${String(index + 1).padStart(2, "0")}`,
      }),
    ),
  ]);
  return { id, organizationId: id };
}
export async function updateStoreIcon(
  services: ApiServices,
  actor: Actor,
  headers: Headers,
  image: File,
) {
  requireManager(actor);
  const store = await services.db
    .select({ organization_id: business.stores.organization_id })
    .from(business.stores)
    .where(eq(business.stores.id, actor.storeId))
    .get();
  ensure(store, "STORE_NOT_FOUND", 404);
  const logo = await saveIdentityImage(services.env, image);
  await services.auth.api.updateOrganization({
    headers,
    body: { organizationId: store.organization_id, data: { logo } },
  });
  return { logo };
}
