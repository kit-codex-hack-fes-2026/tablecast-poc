import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 画像本体はR2、画像ごとに生成した表示情報と店舗の所有関係はここで管理する。
export const mediaAssets = sqliteTable(
  "media_assets",
  {
    store_id: text("store_id").notNull(),
    image_key: text("image_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    blurhash: text("blurhash").notNull(),
  },
  (table) => [primaryKey({ columns: [table.store_id, table.image_key] })],
);
