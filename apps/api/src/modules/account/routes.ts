import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { validateForm } from "../../platform/validation";
import { requireIdentity } from "../auth/middleware";
import { listMcpSessions, revokeMcpSession, updateAvatar } from "./service";
export const accountRoutes = apiFactory
  .createApp()
  .post(
    "/api/account/avatar",
    validateForm(z.object({ image: z.instanceof(File) })),
    requireIdentity,
    async (c) =>
      c.json(
        await updateAvatar(c.get("services"), c.req.raw.headers, c.req.valid("form").image),
        200,
      ),
  )
  .get("/api/account/mcp-sessions", requireIdentity, async (c) =>
    c.json(
      await listMcpSessions(c.get("services"), c.var.staffSession.user.id, c.req.raw.headers),
      200,
    ),
  )
  .post("/api/account/mcp-sessions/:id/revoke", requireIdentity, async (c) =>
    c.json(
      await revokeMcpSession(c.get("services"), c.var.staffSession.user.id, c.req.param("id")),
      200,
    ),
  );
