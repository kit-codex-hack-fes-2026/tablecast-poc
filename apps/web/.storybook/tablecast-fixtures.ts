import type { TablecastSeedPreview } from "../../../scripts/tablecast-storybook-seed.ts";
export {
  configurationHistoryFixture,
  statisticsFixture,
} from "../src/test-support/tablecast-fixtures";

declare const TABLECAST_SEED_PREVIEW: TablecastSeedPreview;

export const catalogs = TABLECAST_SEED_PREVIEW.catalogs;
const primary = catalogs.find((item) => item.storeId === "tablecast-komorebi");
if (!primary) throw new Error("seedのこもれび店舗がありません。");
export const catalog = primary;
const firstProduct = catalog.configuration.products[0];
if (!firstProduct) throw new Error("seedの商品がありません。");
export const product = firstProduct;
export const table = TABLECAST_SEED_PREVIEW.table;
