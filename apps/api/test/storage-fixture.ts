import { reset } from "cloudflare:test";
import { env } from "cloudflare:workers";

export async function resetFixtureStorage() {
  // workerd 1.20260903.1は停止中のD1をreset対象から漏らすため、直前に起動する。
  await env.TABLECAST_DB.prepare("SELECT 1").first();
  await reset();
}
