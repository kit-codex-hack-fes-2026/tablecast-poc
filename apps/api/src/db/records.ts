import type { confirmations, orders, tableEvents, tableSessions } from "./table-schema";
export type TableRecord = typeof tableSessions.$inferSelect;
export type ConfirmationRecord = typeof confirmations.$inferSelect;
export type OrderRecord = typeof orders.$inferSelect;
export type EventRecord = typeof tableEvents.$inferSelect;
