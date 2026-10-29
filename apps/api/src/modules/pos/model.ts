import { z } from "zod";
import { foodResultSchema } from "../catalog/food-model";
import { localizedSchema } from "../catalog/localization";

const posProviderSchema = z.literal("square");
export const posMappingSchema = z
  .object({
    kind: z.enum(["product", "option"]),
    localId: z.string().min(1).max(150),
    externalId: z.string().min(1).max(200),
  })
  .strict();
export const posConfigurationSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    locationId: z.string().min(1).max(200),
    deviceId: z.string().min(1).max(200),
    mappings: z.array(posMappingSchema).max(5000),
  })
  .strict();
export type PosMapping = z.infer<typeof posMappingSchema>;
const posCapabilitiesSchema = z.object({
  catalog: z.boolean(),
  quote: z.boolean(),
  orderExport: z.boolean(),
  checkout: z.boolean(),
  cancel: z.boolean(),
});
export type PosCapabilities = z.infer<typeof posCapabilitiesSchema>;
const posConnectionSchema = z.object({
  id: z.string(),
  provider: posProviderSchema,
  mode: z.enum(["live", "test"]),
  status: z.enum(["connected", "reauthorize", "disconnecting", "disconnected"]),
  merchantId: z.string(),
  locationId: z.string().nullable(),
  deviceId: z.string(),
  revision: z.number().int(),
  updatedAt: z.number(),
});
export type PosConnection = z.infer<typeof posConnectionSchema>;
export const posIssueSchema = z.object({
  code: z.string(),
  localId: z.string().optional(),
  name: z.string().optional(),
  expected: z.number().optional(),
  actual: z.number().optional(),
});
export type PosIssue = z.infer<typeof posIssueSchema>;
const posCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  itemName: z.string().nullable().optional(),
  variationName: z.string().nullable().optional(),
  price: z.number().int().nullable(),
  available: z.boolean(),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number().int(),
      available: z.boolean(),
    }),
  ),
});
export type PosCatalogItem = z.infer<typeof posCatalogItemSchema>;
export const posCatalogSchema = z.object({
  locations: z.array(z.object({ id: z.string(), name: z.string() })),
  items: z.array(posCatalogItemSchema),
  issues: z.array(posIssueSchema),
});
export type PosCatalog = z.infer<typeof posCatalogSchema>;
export const posDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  locationId: z.string(),
});
export type PosDevice = z.infer<typeof posDeviceSchema>;
export const posDeviceCodeSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: z.enum(["pending", "paired", "expired", "unknown"]),
  deviceId: z.string().nullable(),
  expiresAt: z.number(),
});
export type PosDeviceCode = z.infer<typeof posDeviceCodeSchema>;
export const posSettingsSchema = z.object({
  configured: z.boolean(),
  connection: posConnectionSchema.nullable(),
  capabilities: posCapabilitiesSchema,
  mappings: z.array(posMappingSchema),
  products: z.array(
    z.object({
      id: z.string(),
      name: localizedSchema(z.string()),
      price: z.number().int(),
      available: z.boolean(),
      imageKey: z.string().nullable(),
      imageKind: z.enum(["illustration", "photograph"]),
      options: z.array(
        z.object({
          id: z.string(),
          name: localizedSchema(z.string()),
          price: z.number().int(),
          imageKey: z.string().nullable(),
          imageKind: z.enum(["illustration", "photograph"]),
        }),
      ),
    }),
  ),
  devices: z.array(posDeviceSchema),
});
export type PosSettings = z.infer<typeof posSettingsSchema>;
const posInvoiceLineSchema = z.object({
  id: z.string(),
  productId: z.string().nullable(),
  externalId: z.string().nullable(),
  name: z.string(),
  displayName: localizedSchema(z.string()).optional(),
  transliteration: localizedSchema(z.string()).optional(),
  foodInformation: foodResultSchema.optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  referencePrice: z.number().int().nonnegative(),
  options: z.array(
    z.object({
      id: z.string(),
      externalId: z.string().nullable(),
      name: z.string(),
      displayName: localizedSchema(z.string()).optional(),
      quantity: z.number().int().positive(),
      price: z.number().int(),
      referencePrice: z.number().int(),
    }),
  ),
  total: z.number().int().nonnegative(),
});
export const posInvoiceSchema = z.object({
  id: z.string(),
  storeId: z.string(),
  sessionId: z.string(),
  version: z.number().int(),
  currency: z.literal("JPY"),
  total: z.number().int().nonnegative(),
  lines: z.array(posInvoiceLineSchema),
  adjustments: z.array(z.object({ id: z.string(), name: z.string(), amount: z.number().int() })),
});
export type PosInvoice = z.infer<typeof posInvoiceSchema>;
const posCheckoutStatusSchema = z.enum([
  "preparing",
  "pending",
  "completed",
  "cancelled",
  "review",
]);
const posCheckoutSchema = z.object({
  id: z.string(),
  status: posCheckoutStatusSchema,
  amount: z.number().int(),
  currency: z.literal("JPY"),
  updatedAt: z.number(),
  issue: z.string().nullable(),
});
export const posCheckoutViewSchema = z.object({
  connection: posConnectionSchema.nullable(),
  checkout: posCheckoutSchema.nullable(),
  invoice: posInvoiceSchema.nullable(),
  issues: z.array(posIssueSchema),
  locked: z.boolean(),
  canStart: z.boolean(),
  canCancel: z.boolean(),
  canReconcile: z.boolean(),
});
export type PosCheckoutView = z.infer<typeof posCheckoutViewSchema>;
export const posStartSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(100),
  })
  .strict();
