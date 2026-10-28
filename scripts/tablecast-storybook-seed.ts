import type { Catalog, TableState } from "@tablecast/api/schema";
import { priceCart } from "@tablecast/api/bootstrap";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { demoStores } from "./tablecast-fixtures.ts";
import { demoMediaAsset } from "./tablecast-seed-media.ts";
import { sampleLine } from "./tablecast-seed/session.ts";

export type TablecastSeedPreview = { catalogs: Catalog[]; table: TableState };

// DBへ投入する生成関数をBun側で実行し、ブラウザーへは公開デモのJSONと画像だけを渡す。
function createTablecastSeedPreview() {
  const stores = demoStores("demo");
  const store = stores.find((item) => item.id === "tablecast-komorebi");
  if (!store) throw new Error("seedのこもれび店舗がありません。");
  const at = 1788645000000;
  const cart = priceCart(store.configuration, [sampleLine(store.configuration, 0)], 1, null, at);
  const catalogs: Catalog[] = stores.map((item) => ({
    storeId: item.id,
    storeName: item.name,
    version: 1,
    configuration: item.configuration,
  }));
  const table: TableState = {
    kind: "table",
    id: "tablecast-session",
    openedAt: at,
    tableId: `${store.id}-table-1`,
    tableName: "T1",
    storeId: store.id,
    storeName: store.name,
    configVersion: 1,
    locale: "ja",
    status: "open",
    guestCount: 2,
    uiSection: "menu",
    selectedProductId: null,
    menuSearch: null,
    speechSpeed: 1,
    voiceState: "stopped",
    voiceSessionId: null,
    cart,
    orders: [],
    orderSummary: { quantity: 0, productIds: [] },
    bill: {
      orderedTotal: 0,
      adjustmentTotal: 0,
      paidTotal: 0,
      due: 0,
      cartTotal: cart.total,
      planTotal: 0,
    },
    billRequested: false,
    staffCalled: false,
    events: [],
    cursor: 0,
    plan: null,
    snapshot: null,
  };
  const directory = resolve(import.meta.dirname, "../apps/web/.local/tablecast-storybook-public");
  mkdirSync(directory, { recursive: true });
  cpSync(resolve(import.meta.dirname, "../apps/web/public"), directory, { recursive: true });
  const required = new Set(
    stores.flatMap(({ configuration }) =>
      [
        configuration.branding?.logo?.imageKey,
        configuration.branding?.banner?.imageKey,
        ...configuration.products.flatMap((product) => [
          product.imageKey,
          ...product.modifiers.flatMap((group) => group.options.map((option) => option.imageKey)),
        ]),
      ].filter((key): key is string => Boolean(key)),
    ),
  );
  const source = resolve(import.meta.dirname, "../assets/demo");
  const files = [
    ...readdirSync(source).filter((file) => /\.(png|webp)$/.test(file)),
    ...readdirSync(resolve(source, "identities"))
      .filter((file) => /-(logo|banner)\.webp$/.test(file))
      .map((file) => `identities/${file}`),
  ];
  for (const file of files) {
    const bytes = readFileSync(resolve(source, file));
    const asset = demoMediaAsset(file, bytes);
    if (!required.has(asset.key)) continue;
    const paths = [
      "api/table",
      ...stores
        .filter((candidate) => JSON.stringify(candidate.configuration).includes(asset.key))
        .map((candidate) => `api/admin/stores/${candidate.id}`),
    ];
    for (const base of paths) {
      const destination = resolve(directory, base, "images", asset.key);
      if (!existsSync(destination)) {
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
    }
    required.delete(asset.key);
  }
  if (required.size) throw new Error(`seed画像の素材がありません: ${[...required].join(", ")}`);
  return { catalogs, table } satisfies TablecastSeedPreview;
}

if (import.meta.main) console.log(JSON.stringify(createTablecastSeedPreview()));
