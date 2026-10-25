import { createDatabase, identity } from "@tablecast/api/db";
// 認証がGivenの業務E2E専用。未登録からのjourneyはこのfixtureにない利用者で確認する。
export async function seedE2ePolicyPasskeys(binding: D1Database) {
  const db = createDatabase(binding);
  const users = await db.select({ id: identity.user.id }).from(identity.user);
  await db.insert(identity.passkey).values(
    users.map((user) => ({
      id: `tablecast-e2e-policy-${user.id}`,
      name: "TableCast fixture",
      userId: user.id,
      credentialID: btoa(`tablecast-e2e-policy-${user.id}`)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, ""),
      publicKey: "tablecast-test-policy-fixture",
      counter: 0,
      deviceType: "multiDevice",
      backedUp: true,
    })),
  );
}
