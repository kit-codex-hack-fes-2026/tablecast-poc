import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, inject, it } from "vitest";
import * as business from "../src/db/business-schema";
import { resolveText } from "../src/modules/catalog/localization";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { getTableState } from "../src/modules/tables/queries";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { createApiServices } from "../src/platform/context";
import { configurationSchema } from "../src/schema";
import { insertFixture } from "./database-fixture";
import { device, deviceToken, setupFixture } from "./fixture";

const services = () => createApiServices(env);

it("追加言語を公開して卓で選び、保存済みの過去注文の名称を保持する", async () => {
  const { staff, cookie } = await setupFixture();

  await expect(changeLocale(services(), device, "fr")).rejects.toMatchObject({
    code: "LANGUAGE_NOT_ENABLED",
  });
  await updateCart(services(), device, {
    expectedVersion: 0,
    lines: [{ id: "tablecast-french-line", productId: "tea", quantity: 1, selections: [] }],
  });
  const snapshot = await prepareConfirmation(services(), device, {
    expectedVersion: 1,
    channel: "gui",
  });
  // 新フィールド以前の注文も、保存された名称だけで読み出せる。
  const legacy = {
    ...snapshot,
    lines: snapshot.lines.map(({ transliteration: _transliteration, ...line }) => line),
  };
  await env.TABLECAST_DB.batch([
    insertFixture(business.orders, {
      id: "tablecast-legacy-order",
      store_id: staff.storeId,
      table_session_id: device.tableSessionId,
      snapshot_id: snapshot.id,
      idempotency_key: "tablecast-legacy-key",
      status: "served",
      snapshot_json: JSON.stringify(legacy),
      total: snapshot.total,
      created_at: Date.now(),
      updated_at: Date.now(),
    }),
  ]);
  const migration = inject("tablecastMigrations").find((item) =>
    item.name.includes("0033_tablecast_content_languages"),
  );
  if (!migration) throw new Error("言語制約のmigrationがありません。");
  await applyD1Migrations(env.TABLECAST_DB, [
    { ...migration, name: "tablecast-content-languages-rehearsal" },
  ]);
  let draft = await createDraft(services(), staff);
  const product = draft.configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません。");
  const configuration = configurationSchema.parse({
    ...draft.configuration,
    languages: ["ja", "en", "fr"],
    products: draft.configuration.products.map((item) =>
      item.id === product.id
        ? {
            ...item,
            text: {
              ...item.text,
              fr: { displayName: "Thé vert grillé", transliteration: "Hōjicha" },
            },
          }
        : item,
    ),
  });
  const invalid = {
    ...configuration,
    products: configuration.products.map((item) =>
      item.id === product.id
        ? { ...item, text: { ...item.text, fr: { displayName: "Thé vert grillé" } } }
        : item,
    ),
  };
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/drafts/${draft.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expectedVersion: draft.version, configuration: invalid }),
    }),
  );
  expect(response.status).toBe(422);
  draft = await updateDraft(services(), staff, draft.id, {
    expectedVersion: draft.version,
    configuration,
  });
  await validateDraft(services(), staff, draft.id, draft.version);
  await publishDraft(services(), staff, draft.id, {
    approved: true,
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-french-publication",
  });
  const changed = await exports.default.fetch(
    new Request("http://localhost:3000/api/table/locale", {
      method: "PATCH",
      headers: {
        Cookie: `tablecast.device=${deviceToken}`,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ locale: "fr" }),
    }),
  );
  expect(changed.status).toBe(200);
  const state = await getTableState(services(), device);
  expect(state.locale).toBe("fr");
  expect(state.cart.lines[0]?.name.fr).toBe("Thé vert grillé");
  expect(state.cart.lines[0]?.transliteration?.fr).toBe("Hōjicha");
  expect(state.orders[0]?.snapshot.lines[0]?.name).toEqual(snapshot.lines[0]?.name);
  expect(state.orders[0]?.snapshot.lines[0]?.transliteration).toBeUndefined();
  expect(resolveText(configuration.products[1]?.text ?? product.text, "fr").displayName).toBe(
    "Caffè latte",
  );
});
