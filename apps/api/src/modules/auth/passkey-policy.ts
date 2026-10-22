import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { passkey } from "../../db/identity-schema";
import { ensure } from "../../platform/errors";

export async function needsPasskey(db: Database, userId: string) {
  return !(await db
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .limit(1)
    .get());
}

export async function requirePasskey(db: Database, userId: string) {
  ensure(!(await needsPasskey(db, userId)), "PASSKEY_REGISTRATION_REQUIRED", 403);
}
