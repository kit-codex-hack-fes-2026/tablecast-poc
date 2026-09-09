import type { confirmations, orders, stores, tableEvents, tableSessions } from "./business-schema";
export type StoreRecord = typeof stores.$inferSelect;
export type TableRecord = typeof tableSessions.$inferSelect;
export type ConfirmationRecord = typeof confirmations.$inferSelect;
export type OrderRecord = typeof orders.$inferSelect;
export type EventRecord = typeof tableEvents.$inferSelect;
