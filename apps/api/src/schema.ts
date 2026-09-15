// Webと外部consumer向けの公開契約。定義は各業務moduleが所有する。
export {
  customerConsentVersion,
  enrolCustomerSchema,
  customerPreferencesSchema,
} from "./modules/customers/model";
export {
  gameManifestSchema,
  gamePackageSchema,
  gameMessageSchema,
  gameStateSchema,
} from "./modules/games/model";
export type { GameManifest, GamePackage, GameState } from "./modules/games/model";
export {
  maxImageBytes,
  imageMetadataSchema,
  imageSourceSchema,
  uploadedImageSchema,
  uploadImageSchema,
} from "./modules/media/model";
export {
  bilingualSchema,
  contentSchema,
  modifierSchema,
  optionSchema,
  planSchema,
  productSchema,
  optionConditionSchema,
  optionConditionsSchema,
  conditionLimits,
} from "./modules/catalog/model";
export type {
  Modifier,
  Plan,
  Product,
  OptionCondition,
  OptionConditions,
} from "./modules/catalog/model";
export {
  catalogSchema,
  configDraftSchema,
  configurationIssueSchema,
  configurationSchema,
  draftChoicesPageSchema,
  conditionPreviewSchema,
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
  conditionIssueSchema,
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
  storeTimeZone,
  storeDateSchema,
  timelineQuerySchema,
  timelineSessionSchema,
  timelinePageSchema,
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
  TimelinePage,
  TimelineQuery,
  TimelineSession,
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
export { apiErrorSchema, localeSchema, validationIssuesSchema } from "./platform/model";
export type { ApiError, Locale } from "./platform/model";

export { showProductsSchema } from "./modules/voice/model";

export { demoSchema, demoUpdateSchema, type Demo, type DemoUpdate } from "./modules/demo/model";

export {
  castInstructionSchema,
  instructionDocumentSchema,
  instructionText,
  instructionLimit,
  type CastInstruction,
  type InstructionDocument,
  type InstructionBlock,
} from "./modules/configuration/instruction-model";

export {
  statisticsQuerySchema,
  statisticsResultSchema,
  type StatisticsQuery,
  type StatisticsResult,
} from "./modules/statistics/model";

export {
  customerMemoryInputSchema,
  customerConsumptionSchema,
} from "./modules/customer-memory/model";

export {
  pointRulesSchema,
  pointPolicySchema,
  confirmPointsSchema,
  pointCorrectionSchema,
} from "./modules/customer-points/model";
