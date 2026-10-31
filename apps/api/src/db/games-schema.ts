import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const gamePlugins = sqliteTable(
  "game_plugins",
  {
    store_id: text("store_id").notNull(),
    id: text("id").notNull(),
    active_version_id: text("active_version_id"),
    revision: integer("revision").notNull().default(0),
    mutation_id: text("mutation_id"),
  },
  (table) => [primaryKey({ columns: [table.store_id, table.id] })],
);

export const gameVersions = sqliteTable("game_versions", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  game_id: text("game_id").notNull(),
  manifest_json: text("manifest_json").notNull(),
  package_key: text("package_key").notNull(),
  status: text("status", { enum: ["draft", "ready"] })
    .notNull()
    .default("draft"),
  previewed_by: text("previewed_by"),
  published_by: text("published_by"),
  created_at: integer("created_at").notNull(),
});

export const gameRuns = sqliteTable("game_runs", {
  id: text("id").primaryKey().notNull(),
  store_id: text("store_id").notNull(),
  table_session_id: text("table_session_id").notNull(),
  game_id: text("game_id").notNull(),
  version_id: text("version_id").notNull(),
  state_json: text("state_json").notNull().default("{}"),
  revision: integer("revision").notNull().default(0),
  ended_at: integer("ended_at"),
});
