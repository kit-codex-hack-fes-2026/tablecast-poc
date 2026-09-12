import { and, desc, eq, isNull, max, or, sql } from "drizzle-orm";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "../../db/auth-schema";
import { stores } from "../../db/business-schema";
import type { Database } from "../../platform/context";
export async function getMcpSessions(
  db: Database,
  userId: string,
  consents: { id: string; scopes: string[] }[],
) {
  const accessExpiry = db
    .select({ value: max(oauthAccessToken.expiresAt).mapWith(Number) })
    .from(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.userId, oauthConsent.userId),
        eq(oauthAccessToken.clientId, oauthConsent.clientId),
        or(
          eq(oauthAccessToken.referenceId, oauthConsent.referenceId),
          and(isNull(oauthAccessToken.referenceId), isNull(oauthConsent.referenceId)),
        ),
        isNull(oauthAccessToken.revoked),
      ),
    );
  const refreshExpiry = db
    .select({ value: max(oauthRefreshToken.expiresAt).mapWith(Number) })
    .from(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.userId, oauthConsent.userId),
        eq(oauthRefreshToken.clientId, oauthConsent.clientId),
        or(
          eq(oauthRefreshToken.referenceId, oauthConsent.referenceId),
          and(isNull(oauthRefreshToken.referenceId), isNull(oauthConsent.referenceId)),
        ),
        isNull(oauthRefreshToken.revoked),
      ),
    );
  const rows = await db
    .select({
      id: oauthConsent.id,
      clientName: oauthClient.name,
      clientId: oauthConsent.clientId,
      storeName: stores.name,
      createdAt: oauthConsent.createdAt,
      updatedAt: oauthConsent.updatedAt,
      expiresAt: sql<number | null>`(${accessExpiry})`.mapWith(Number),
      refreshExpiresAt: sql<number | null>`(${refreshExpiry})`.mapWith(Number),
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .leftJoin(stores, eq(stores.organization_id, oauthConsent.referenceId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.updatedAt));
  const scopesById = new Map(consents.map((consent) => [consent.id, consent.scopes]));
  return {
    sessions: rows.flatMap((row) => {
      const scopes = scopesById.get(row.id);
      return scopes
        ? [
            {
              ...row,
              createdAt: row.createdAt.getTime(),
              updatedAt: row.updatedAt.getTime(),
              scopes,
              status:
                Math.max(row.expiresAt ?? 0, row.refreshExpiresAt ?? 0) > Date.now()
                  ? ("active" as const)
                  : ("expired" as const),
            },
          ]
        : [];
    }),
  };
}
