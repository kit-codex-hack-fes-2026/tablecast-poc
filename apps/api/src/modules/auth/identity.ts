import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";
import type { Database } from "../../db/client";
import * as schema from "../../db/auth-schema";
import { ensure } from "../../platform/errors";
import { identityOptions } from "./identity-options";

// GUIでは標準session検証だけを初期化し、OAuth resource・課金・メールを読み込まない。
export function createIdentity(env: TablecastEnv, db: Database) {
  ensure(
    env.TABLECAST_AUTH_SECRET && env.TABLECAST_AUTH_SECRET.length >= 32,
    "AUTH_NOT_CONFIGURED",
    503,
  );
  const options = identityOptions(env.TABLECAST_PUBLIC_ORIGIN, env.TABLECAST_AUTH_SECRET);
  return betterAuth({
    ...options,
    onAPIError: { throw: true },
    rateLimit: { ...options.rateLimit, enabled: env.TABLECAST_ENV === "production" },
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
  });
}
