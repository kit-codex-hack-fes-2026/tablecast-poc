import { z } from "zod";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { validateQuery } from "../../platform/validation";
import { getCatalog } from "../catalog/queries";
import { instructionResponse } from "../configuration/instruction-response";
import { withImageAssets } from "../media/queries";
import { getHomeSummary } from "./home";
import { getAdminState, listMemberStores } from "./queries";

export const initialRoutes = apiFactory.createApp().get(
  "/api/admin/initial",
  validateQuery(
    z
      .object({
        storeId: z.string().min(1).optional(),
        defaultFloor: z.enum(["true"]).optional(),
        view: z.enum(["catalog", "home"]).optional(),
      })
      .refine(
        (query) =>
          !query.view ||
          (query.storeId
            ? !query.defaultFloor
            : query.view === "home" && query.defaultFloor === "true"),
      ),
  ),
  async (c) => {
    const services = c.get("services");
    const { response: session, headers } = await (
      await services.getIdentity()
    ).api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    if (!session)
      return c.json(
        {
          session: null,
          stores: [],
          floor: null,
          catalog: null,
          home: null,
        },
        200,
      );
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
      membership && view !== "catalog"
        ? await getAdminState(services, {
            kind: "staff",
            storeId: membership.id,
            userId: session.user.id,
            role: membership.role,
          })
        : null;
    const catalog =
      membership && view === "catalog"
        ? instructionResponse(
            await withImageAssets(services, await getCatalog(services, membership.id)),
            c.req.header("X-Tablecast-Instructions"),
          )
        : null;
    const home =
      membership && view === "home" && ["owner", "admin"].includes(membership.role)
        ? await getHomeSummary(services, {
            kind: "staff",
            storeId: membership.id,
            userId: session.user.id,
            role: membership.role,
          })
        : null;
    return c.json({ session, stores, floor, catalog, home }, 200);
  },
);
