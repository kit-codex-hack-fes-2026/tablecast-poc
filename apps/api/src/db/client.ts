import { drizzle } from "drizzle-orm/d1";
import { authRelations } from "./auth-relations";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { relations: authRelations });
}
export type Database = ReturnType<typeof createDatabase>;
