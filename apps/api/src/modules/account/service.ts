import { and, eq, isNull } from "drizzle-orm";
import * as authTables from "../../db/auth-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { saveIdentityImage } from "../media/service";
import { getMcpSessions } from "./queries";
export async function updateAvatar(services: ApiServices, headers: Headers, image: File) {
  const url = await saveIdentityImage(services.env, image);
  await services.auth.api.updateUser({ headers, body: { image: url } });
  return { ok: true };
}
export async function listMcpSessions(services: ApiServices, userId: string, headers: Headers) {
  return getMcpSessions(services.db, userId, await services.auth.api.getOAuthConsents({ headers }));
}
export async function revokeMcpSession(services: ApiServices, userId: string, id: string) {
  const { db } = services;
  const consent = await db
    .select({
      clientId: authTables.oauthConsent.clientId,
      referenceId: authTables.oauthConsent.referenceId,
    })
    .from(authTables.oauthConsent)
    .where(and(eq(authTables.oauthConsent.id, id), eq(authTables.oauthConsent.userId, userId)))
    .get();
  ensure(consent, "MCP_SESSION_NOT_FOUND", 404);
  const now = new Date();
  await db.batch([
    db
      .update(authTables.oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(authTables.oauthAccessToken.userId, userId),
          eq(authTables.oauthAccessToken.clientId, consent.clientId),
          consent.referenceId === null
            ? isNull(authTables.oauthAccessToken.referenceId)
            : eq(authTables.oauthAccessToken.referenceId, consent.referenceId),
        ),
      ),
    db
      .update(authTables.oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(authTables.oauthRefreshToken.userId, userId),
          eq(authTables.oauthRefreshToken.clientId, consent.clientId),
          consent.referenceId === null
            ? isNull(authTables.oauthRefreshToken.referenceId)
            : eq(authTables.oauthRefreshToken.referenceId, consent.referenceId),
        ),
      ),
    db
      .delete(authTables.oauthConsent)
      .where(and(eq(authTables.oauthConsent.id, id), eq(authTables.oauthConsent.userId, userId))),
  ]);
  return { revoked: true };
}
