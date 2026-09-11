// Webと外部consumer向けの公開契約。定義は各業務moduleが所有する。
export {
  bilingualSchema,
  contentSchema,
  modifierSchema,
  optionSchema,
  planSchema,
  productSchema,
} from "./modules/catalog/model";
export type { Modifier, Plan, Product } from "./modules/catalog/model";
export {
  catalogSchema,
  configDraftSchema,
  configurationIssueSchema,
  configurationSchema,
} from "./modules/configuration/model";
export type {
  Catalog,
  ConfigDraft,
  Configuration,
  ConfigurationIssue,
} from "./modules/configuration/model";
export {
  billSchema,
  cartLineSchema,
  cartSchema,
  cartUpdateSchema,
  orderSchema,
  prepareSchema,
  pricedLineSchema,
  selectionSchema,
  snapshotSchema,
  submitSchema,
} from "./modules/orders/model";
export type {
  Bill,
  Cart,
  CartLine,
  CartUpdate,
  Order,
  PricedLine,
  Snapshot,
} from "./modules/orders/model";
export { adminStateSchema, createStoreSchema, storeSummarySchema } from "./modules/stores/model";
export type { AdminState, StoreSummary } from "./modules/stores/model";
export {
  closedSessionSummarySchema,
  eventDataSchema,
  eventsSchema,
  historyPageSchema,
  historyQuerySchema,
  sessionEventsPageSchema,
  sessionEventsQuerySchema,
  tableEventSchema,
  tablePlanSchema,
  tableStateSchema,
  uiSectionInputSchema,
  uiSectionSchema,
} from "./modules/tables/model";
export type {
  ClosedSessionSummary,
  HistoryPage,
  HistoryQuery,
  SessionEventsPage,
  SessionEventsQuery,
  TableEvent,
  TableState,
  UiSection,
  UiSectionInput,
} from "./modules/tables/model";
export {
  speechSpeedInputSchema,
  speechSpeedSchema,
  voiceFailedEventSchema,
  voiceListQuerySchema,
  voicePageSchema,
  voiceProductsEventSchema,
  voiceSummarySchema,
  voiceToolEventSchema,
  voiceToolNameSchema,
  voiceTriggerSchema,
  voiceTurnSchema,
} from "./modules/voice/model";
export type { VoiceListQuery, VoicePage, VoiceSummary, VoiceTrigger } from "./modules/voice/model";
export { localeSchema } from "./platform/model";
export type { ApiError, Locale } from "./platform/model";

export { showProductsSchema } from "./modules/voice/model";

export { demoSchema, demoUpdateSchema, type Demo, type DemoUpdate } from "./modules/demo/model";
