import { and, desc, eq, isNull, max, or, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { ApiServices } from "../../platform/context";
import * as authTables from "../../db/identity-schema";
import {
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
} from "../../db/oauth-schema";
import { stores } from "../../db/table-schema";
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
      expiresAt: sql<null | number>`(${accessExpiry})`.mapWith(Number),
      refreshExpiresAt: sql<null | number>`(${refreshExpiry})`.mapWith(Number),
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

export async function getInvitationDetails(services: ApiServices, id: string) {
  return services.db
    .select({
      id: authTables.invitation.id,
      email: authTables.invitation.email,
      role: authTables.invitation.role,
      status: authTables.invitation.status,
      expiresAt: authTables.invitation.expiresAt,
      organizationName: authTables.organization.name,
    })
    .from(authTables.invitation)
    .innerJoin(
      authTables.organization,
      eq(authTables.organization.id, authTables.invitation.organizationId),
    )
    .where(eq(authTables.invitation.id, id))
    .get();
}
