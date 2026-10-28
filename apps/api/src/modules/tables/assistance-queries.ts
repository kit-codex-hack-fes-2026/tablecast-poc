import type { z } from "zod";
import { and, desc, eq, lt, or } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { getCatalog } from "../catalog/queries";
import { createMenuSearch } from "../catalog/search";
import {
  type serviceGuidanceQuerySchema,
  type staffCallPageQuerySchema,
  staffCallSchema,
} from "./model";
import { getSession } from "./queries";

function staffCallValue(row: typeof business.staffCalls.$inferSelect) {
  const handoff: unknown = JSON.parse(row.handoff_json);
  return staffCallSchema.parse({
    id: row.id,
    status: row.status,
    handoff,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  });
}

export async function getStaffCalls(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof staffCallPageQuerySchema>,
) {
  const session = await getSession(services, actor);
  const rows = await services.db
    .select()
    .from(business.staffCalls)
    .where(
      and(
        eq(business.staffCalls.store_id, actor.storeId),
        eq(business.staffCalls.table_session_id, session.id),
        input.beforeCreatedAt === undefined || !input.beforeId
          ? undefined
          : or(
              lt(business.staffCalls.created_at, input.beforeCreatedAt),
              and(
                eq(business.staffCalls.created_at, input.beforeCreatedAt),
                lt(business.staffCalls.id, input.beforeId),
              ),
            ),
      ),
    )
    .orderBy(desc(business.staffCalls.created_at), desc(business.staffCalls.id))
    .limit(input.limit + 1);
  const calls = rows.slice(0, input.limit).map(staffCallValue);
  const last = calls.at(-1);
  return {
    calls,
    nextCursor:
      rows.length > input.limit && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function getServiceGuidance(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof serviceGuidanceQuerySchema>,
) {
  const session = await getSession(services, actor);
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  const configuration = catalog.configuration;
  const matches = input.guideId
    ? [input.guideId]
    : createMenuSearch(configuration, "guides")(input.query).ids;
  ensure(
    !input.guideId || configuration.guides?.some((guide) => guide.id === input.guideId),
    "GUIDE_NOT_FOUND",
    422,
  );
  const guides = matches.flatMap(
    (id) => configuration.guides?.find((guide) => guide.id === id) ?? [],
  );
  const offset = input.offset ?? 0;
  const page = guides.slice(offset, offset + 4);
  const productIds = [
    ...new Set([
      ...guides.flatMap((guide) => guide.productIds),
      ...(input.query ? createMenuSearch(configuration)(input.query).ids : []),
    ]),
  ];
  return {
    configVersion: catalog.version,
    guides: page.map((guide) => ({
      id: guide.id,
      text: guide.text[session.locale],
      links: guide.links.map((link) => ({ label: link.label[session.locale], url: link.url })),
    })),
    products: productIds.slice(offset, offset + 4).flatMap((id) => {
      const product = configuration.products.find((item) => item.id === id);
      return product
        ? [
            {
              id,
              text: {
                displayName: product.text[session.locale].displayName,
                speechName: product.text[session.locale].speechName,
              },
              price: product.price,
              available: product.available,
            },
          ]
        : [];
    }),
    nextOffset: offset + 4 < guides.length || offset + 4 < productIds.length ? offset + 4 : null,
  };
}
