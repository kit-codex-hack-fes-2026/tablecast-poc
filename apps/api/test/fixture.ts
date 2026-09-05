import { env } from "cloudflare:workers";
import { createAuth, hashDeviceToken, type Actor } from "../src/auth";
import { configurationSchema, type Configuration } from "../src/schema";
import { ensure } from "../src/errors";

export const device: Actor = {
  kind: "device",
  storeId: "tablecast-store",
  tableSessionId: "tablecast-session",
};
export const deviceToken = "tablecast-fixture-device-token";
export const text = (ja: string, en: string) => ({
  ja: { displayName: ja, speechName: ja, description: `${ja}の説明`, aliases: [] },
  en: { displayName: en, speechName: en, description: `${en} description`, aliases: [] },
});
const allergens = {
  contains: [] as string[],
  evidence: "unknown" as const,
  crossContact: "unknown" as const,
  vegan: "unknown" as const,
  note: { ja: "スタッフにご確認ください", en: "Please ask a member of staff" },
};
export const configuration: Configuration = configurationSchema.parse({
  categories: [{ id: "drinks", text: text("飲み物", "Drinks") }],
  products: [
    {
      id: "tea",
      categoryId: "drinks",
      text: text("ほうじ茶", "Roasted green tea"),
      price: 400,
      available: true,
      allergens,
    },
    {
      id: "coffee",
      categoryId: "drinks",
      text: text("カフェラテ", "Caffè latte"),
      price: 500,
      available: true,
      allergens,
      modifiers: [
        {
          id: "milk",
          text: text("ミルク", "Milk"),
          kind: "single",
          min: 1,
          max: 1,
          options: [
            { id: "dairy", text: text("牛乳", "Dairy milk"), priceDelta: 0, available: true },
            { id: "oat", text: text("オーツミルク", "Oat milk"), priceDelta: 100, available: true },
          ],
        },
      ],
    },
  ],
  plans: [],
  cast: {
    instructions: { ja: "丁寧な接客", en: "Polite service" },
    voice: { ja: null, en: null },
    proactive: false,
  },
});
export async function setupFixture() {
  const response = await createAuth(env).api.signUpEmail({
    body: {
      email: "tablecast-staff@example.test",
      password: "tablecast-local-fixture-password",
      name: "店員",
    },
    asResponse: true,
  });
  ensure(response.ok, "FIXTURE_AUTH_FAILED", 503);
  const user = await env.TABLECAST_DB.prepare("SELECT id FROM user WHERE email=?")
    .bind("tablecast-staff@example.test")
    .first<{ id: string }>();
  ensure(user, "FIXTURE_USER_MISSING", 503);
  const now = Date.now();
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO organization(id,name,slug,created_at) VALUES(?,?,?,?)",
    ).bind("tablecast-org", "店舗", "tablecast-test", now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO member(id,organization_id,user_id,role,created_at) VALUES(?,?,?,?,?)",
    ).bind("tablecast-member", "tablecast-org", user.id, "owner", now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) VALUES(?,?,?,?,?)",
    ).bind("tablecast-store", "tablecast-org", "卓上喫茶", JSON.stringify(configuration), now),
    env.TABLECAST_DB.prepare("INSERT INTO restaurant_tables(id,store_id,name) VALUES(?,?,?)").bind(
      "tablecast-table",
      "tablecast-store",
      "01",
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,opened_at) VALUES(?,?,?,?,?,?)",
    ).bind("tablecast-session", "tablecast-store", "tablecast-table", "ja", 2, now),
    env.TABLECAST_DB.prepare(
      "INSERT INTO devices(id,token_hash,store_id,table_id,approved_by,created_at) VALUES(?,?,?,?,?,?)",
    ).bind(
      "tablecast-device",
      await hashDeviceToken(deviceToken),
      "tablecast-store",
      "tablecast-table",
      user.id,
      now,
    ),
  ]);
  return {
    staff: {
      kind: "staff",
      storeId: "tablecast-store",
      userId: user.id,
      role: "owner",
      tableSessionId: "tablecast-session",
    } satisfies Actor,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
