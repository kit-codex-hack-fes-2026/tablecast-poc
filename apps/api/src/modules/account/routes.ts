import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { staffIdentity } from "../auth/middleware";
import { listMcpSessions, revokeMcpSession, updateAvatar } from "./service";
export const accountRoutes = new Hono<ApiEnv>()
  .post(
    "/api/account/avatar",
    zValidator("form", z.object({ image: z.instanceof(File) })),
    async (c) => {
      await staffIdentity(c);
      return c.json(
        await updateAvatar(c.get("services"), c.req.raw.headers, c.req.valid("form").image),
      );
    },
  )
  .get("/api/account/mcp-sessions", async (c) => {
    const session = await staffIdentity(c);
    return c.json(await listMcpSessions(c.get("services"), session.user.id, c.req.raw.headers));
  })
  .post("/api/account/mcp-sessions/:id/revoke", async (c) => {
    const session = await staffIdentity(c);
    return c.json(await revokeMcpSession(c.get("services"), session.user.id, c.req.param("id")));
  });
