export async function getMcpSessions(
  db: D1Database,
  userId: string,
  consents: { id: string; scopes: string[] }[],
) {
  const rows = await db
    .prepare(
      "SELECT consent.id,client.name AS clientName,consent.client_id AS clientId,store.name AS storeName,consent.created_at AS createdAt,consent.updated_at AS updatedAt,(SELECT MAX(expires_at) FROM oauth_access_token token WHERE token.user_id=consent.user_id AND token.client_id=consent.client_id AND token.reference_id IS consent.reference_id AND token.revoked IS NULL) AS expiresAt FROM oauth_consent consent JOIN oauth_client client ON client.client_id=consent.client_id LEFT JOIN stores store ON store.organization_id=consent.reference_id WHERE consent.user_id=? ORDER BY consent.updated_at DESC",
    )
    .bind(userId)
    .all<{
      id: string;
      clientName: string | null;
      clientId: string;
      storeName: string | null;
      createdAt: number;
      updatedAt: number;
      expiresAt: number | null;
    }>();
  return {
    sessions: rows.results.flatMap((row) => {
      const consent = consents.find((item) => item.id === row.id);
      return consent ? [{ ...row, scopes: consent.scopes }] : [];
    }),
  };
}
