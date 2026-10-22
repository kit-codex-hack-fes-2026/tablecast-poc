import { z } from "zod";
import { apiFactory } from "../../platform/http";
import { validateForm } from "../../platform/validation";
import { requireIdentity } from "../auth/middleware";
import { getInvitationDetails } from "./queries";
import { listMcpSessions, revokeMcpSession, updateAvatar } from "./service";
export const accountRoutes = apiFactory
  .createApp()
  .get("/api/account/auth-config", (c) =>
    c.json(
      {
        googleOneTapClientId:
          !c.env.TABLECAST_GOOGLE_EMULATOR_URL && c.env.TABLECAST_GOOGLE_CLIENT_SECRET
            ? (c.env.TABLECAST_GOOGLE_CLIENT_ID ?? null)
            : null,
      },
      200,
    ),
  )
  .get("/api/account/auth-state", async (c) => {
    c.header("Cache-Control", "private, no-store");
    const { response: session, headers } = await c
      .get("services")
      .auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true });
    return c.json(
      session ? { ...session, passkeyRequired: session.user.passkeyRegistered !== true } : null,
      200,
    );
  })
  .get("/api/account/invitations/:id", requireIdentity, async (c) => {
    const invitation = await getInvitationDetails(c.get("services"), c.req.param("id"));
    c.header("Cache-Control", "private, no-store");
    if (!invitation) return c.json({ state: "missing" as const, invitation: null }, 200);
    if (invitation.email.toLowerCase() !== c.var.staffSession.user.email.toLowerCase())
      return c.json({ state: "email-mismatch" as const, invitation: null }, 200);
    const state =
      invitation.status === "pending" && invitation.expiresAt.getTime() <= Date.now()
        ? "expired"
        : invitation.status;
    return c.json({ state, invitation }, 200);
  })
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
