import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validateForm } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { listMcpSessions, revokeMcpSession, updateAvatar } from "./service";
export const accountRoutes = new Hono<ApiEnv>()
  .post("/api/account/avatar", validateForm(z.object({ image: z.instanceof(File) })), async (c) => {
    await staffIdentity(c);
    return c.json(
      await updateAvatar(c.get("services"), c.req.raw.headers, c.req.valid("form").image),
      200,
    );
  })
  .get("/api/account/mcp-sessions", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listMcpSessions(c.get("services"), session.user.id, c.req.raw.headers),
      200,
    );
  })
  .post("/api/account/mcp-sessions/:id/revoke", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await revokeMcpSession(c.get("services"), session.user.id, c.req.param("id")),
      200,
    );
  });
