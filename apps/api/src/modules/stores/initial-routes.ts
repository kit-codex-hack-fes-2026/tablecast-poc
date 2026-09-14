import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { validateQuery } from "../../platform/validation";
import { getAdminState, listMemberStores } from "./queries";
import { getCatalog } from "../catalog/queries";

export const initialRoutes = new Hono<ApiEnv>().get(
  "/api/admin/initial",
  validateQuery(
    z
      .object({
        storeId: z.string().min(1).optional(),
        defaultFloor: z.enum(["true"]).optional(),
        view: z.enum(["catalog"]).optional(),
      })
      .refine((query) => !query.view || (!!query.storeId && !query.defaultFloor)),
  ),
  async (c) => {
    const services = c.get("services");
    const { response: session, headers } = await services.auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    if (!session) return c.json({ session: null, stores: [], floor: null, catalog: null }, 200);
    const stores = await listMemberStores(services, session.user.id);
    const { storeId, defaultFloor, view } = c.req.valid("query");
    const membership = storeId
      ? stores.find((store) => store.id === storeId)
      : defaultFloor
        ? (stores.find((store) => store.organizationId === session.session.activeOrganizationId) ??
          stores[0])
        : undefined;
    if (storeId) ensure(membership, "STORE_FORBIDDEN", 403);
    const floor =
      membership && !view
        ? await getAdminState(services, {
            kind: "staff",
            storeId: membership.id,
            userId: session.user.id,
            role: membership.role,
          })
        : null;
    const catalog =
      membership && view === "catalog" ? await getCatalog(services, membership.id) : null;
    return c.json({ session, stores, floor, catalog }, 200);
  },
);
