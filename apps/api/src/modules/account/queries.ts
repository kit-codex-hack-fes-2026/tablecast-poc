import { sql } from "drizzle-orm";
import type { Database } from "../../platform/context";
export async function getMcpSessions(
  db: Database,
  userId: string,
  consents: { id: string; scopes: string[] }[],
) {
  const rows = await db.all<{
    id: string;
    clientName: string | null;
    clientId: string;
    storeName: string | null;
    createdAt: number;
    updatedAt: number;
    expiresAt: number | null;
    refreshExpiresAt: number | null;
  }>(
    sql`SELECT consent.id,client.name AS clientName,consent.client_id AS clientId,store.name AS storeName,consent.created_at AS createdAt,consent.updated_at AS updatedAt,(SELECT MAX(expires_at) FROM oauth_access_token token WHERE token.user_id=consent.user_id AND token.client_id=consent.client_id AND token.reference_id IS consent.reference_id AND token.revoked IS NULL) AS expiresAt,(SELECT MAX(expires_at) FROM oauth_refresh_token token WHERE token.user_id=consent.user_id AND token.client_id=consent.client_id AND token.reference_id IS consent.reference_id AND token.revoked IS NULL) AS refreshExpiresAt FROM oauth_consent consent JOIN oauth_client client ON client.client_id=consent.client_id LEFT JOIN stores store ON store.organization_id=consent.reference_id WHERE consent.user_id=${userId} ORDER BY consent.updated_at DESC`,
  );
  return {
    sessions: rows.flatMap((row) => {
      const consent = consents.find((item) => item.id === row.id);
      return consent
        ? [
            {
              ...row,
              scopes: consent.scopes,
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
