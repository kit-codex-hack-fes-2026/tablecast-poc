import { sql } from "drizzle-orm";
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
  const consent = await db.get<{ client_id: string; reference_id: string | null } | undefined>(
    sql`SELECT client_id,reference_id FROM oauth_consent WHERE id=${id} AND user_id=${userId}`,
  );
  ensure(consent, "MCP_SESSION_NOT_FOUND", 404);
  const now = Date.now();
  await db.batch([
    db
      .update(authTables.oauthAccessToken)
      .set({ revoked: sql`${now}` })
      .where(
        sql`user_id=${userId} AND client_id=${consent.client_id} AND reference_id IS ${consent.reference_id}`,
      ),
    db
      .update(authTables.oauthRefreshToken)
      .set({ revoked: sql`${now}` })
      .where(
        sql`user_id=${userId} AND client_id=${consent.client_id} AND reference_id IS ${consent.reference_id}`,
      ),
    db.delete(authTables.oauthConsent).where(sql`id=${id} AND user_id=${userId}`),
  ]);
  return { revoked: true };
}
