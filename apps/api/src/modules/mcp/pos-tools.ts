import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { ensure } from "../../platform/errors";
import {
  getPosCatalog,
  getPosSettings,
  savePosMappings,
  savePosSettings,
} from "../pos/connections";
import { getPosDevices } from "../pos/devices";
import {
  posCatalogSchema,
  posConfigurationSchema,
  posDeviceSchema,
  posMappingSchema,
  posMappingsUpdateSchema,
  posSettingsSchema,
} from "../pos/model";
import { result } from "./result";

const pageInput = {
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(1000).optional(),
};
const pageOutput = { total: z.number().int().nonnegative(), nextCursor: z.string().nullable() };
const locationInput = { locationId: z.string().min(1).max(200).optional(), ...pageInput };
const item = posCatalogSchema.shape.items.element;
const catalogEntry = z.discriminatedUnion("kind", [
  posCatalogSchema.shape.locations.element.extend({ kind: z.literal("location") }),
  item.omit({ options: true }).extend({ kind: z.literal("product") }),
  item.shape.options.element.extend({ kind: z.literal("option"), productId: z.string() }),
]);
const localEntry = z.object({
  kind: z.enum(["product", "option"]),
  id: z.string(),
  productId: z.string().nullable(),
  name: posSettingsSchema.shape.products.element.shape.name,
  price: z.number().int(),
  available: z.boolean().nullable(),
});
const settingsMetadata = posSettingsSchema.pick({
  configured: true,
  connection: true,
  capabilities: true,
  mappingConnectionId: true,
  publishedVersion: true,
  draft: true,
});
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const entryOrder = (
  left: { id: string; kind: string; productId?: null | string },
  right: { id: string; kind: string; productId?: null | string },
) =>
  compare(left.kind, right.kind) ||
  compare(left.productId ?? "", right.productId ?? "") ||
  compare(left.id, right.id);

/** 読取の変化をcursorで検出し、ページ間の対応・価格の脱落を防ぐ。 */
async function page<T>(
  entries: T[],
  context: unknown,
  input: z.infer<z.ZodObject<typeof pageInput>>,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ context, entries })),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  let offset = 0;
  if (input.cursor) {
    let value: unknown;
    try {
      value = JSON.parse(atob(input.cursor));
    } catch {
      ensure(false, "POS_CURSOR_INVALID", 400);
    }
    const cursor = z
      .object({ offset: z.number().int().nonnegative(), hash: z.string() })
      .safeParse(value);
    ensure(cursor.success, "POS_CURSOR_INVALID", 400);
    ensure(cursor.data.hash === hash, "POS_CURSOR_STALE", 409);
    ensure(cursor.data.offset <= entries.length, "POS_CURSOR_INVALID", 400);
    offset = cursor.data.offset;
  }
  const next = offset + input.limit;
  return {
    entries: entries.slice(offset, next),
    total: entries.length,
    nextCursor: next < entries.length ? btoa(JSON.stringify({ offset: next, hash })) : null,
  };
}
const output = <T extends object>(data: T) => ({ ...result(data), structuredContent: data });

export function registerPosTools(server: McpServer, services: ApiServices, actor: Actor) {
  const identity = {
    storeId: actor.storeId,
    settingsUrl: new URL(
      `/admin/stores/${encodeURIComponent(actor.storeId)}/pos`,
      services.env.TABLECAST_PUBLIC_ORIGIN,
    ).href,
  };
  const identitySchema = { storeId: z.string(), settingsUrl: z.string().url() };
  server.registerTool(
    "get_pos_settings",
    {
      description:
        "店舗のPOS状態と商品・対応をページ取得する。draftId省略は公開版、指定時は対象下書きの商品・価格・対応とdraft.version/baseVersionを返す。publishedVersionは現在の公開版。nameは登録済み各言語の原文を保持し未翻訳言語を補わない。owner/adminのtablecast:readで未接続でも読める。OAuthはsettingsUrlのGUIを案内する。section=itemsはproduct/optionの行でoption.productIdは親local商品。section=mappingsで対象版の全対応、legacyMappingsで旧live対応の明示取込候補を読む。legacyは会計に使われず、初回下書きへ取り込む場合だけ利用する。limit既定50、最大100、nextCursorがnullまで同条件で読み、POS_CURSOR_STALEなら再取得する。tokenは返さない。",
      inputSchema: z
        .object({
          draftId: z.string().min(1).max(200).optional(),
          section: z.enum(["items", "mappings", "legacyMappings"]).default("items"),
          ...pageInput,
        })
        .strict(),
      outputSchema: {
        ...settingsMetadata.shape,
        ...identitySchema,
        ...pageOutput,
        section: z.enum(["items", "mappings", "legacyMappings"]),
        legacy: z.object({ connectionId: z.string(), count: z.number().int() }).nullable(),
        items: z.array(localEntry),
        mappings: z.array(posMappingSchema),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const settings = await getPosSettings(services, actor, input.draftId);
      const metadata = {
        ...settingsMetadata.parse(settings),
        legacy: settings.legacyMappings
          ? {
              connectionId: settings.legacyMappings.connectionId,
              count: settings.legacyMappings.mappings.length,
            }
          : null,
      };
      const context = { ...identity, ...metadata, section: input.section };
      if (input.section !== "items") {
        const entries = (
          input.section === "legacyMappings"
            ? (settings.legacyMappings?.mappings ?? [])
            : settings.mappings
        ).toSorted(
          (left, right) =>
            compare(left.kind, right.kind) ||
            compare(left.localId, right.localId) ||
            compare(left.externalId, right.externalId),
        );
        const data = await page(entries, context, input);
        return output({
          ...identity,
          ...metadata,
          section: input.section,
          total: data.total,
          nextCursor: data.nextCursor,
          items: [],
          mappings: data.entries,
        });
      }
      const entries: z.infer<typeof localEntry>[] = settings.products.flatMap((product) => [
        {
          kind: "product" as const,
          id: product.id,
          productId: null,
          name: product.name,
          price: product.price,
          available: product.available,
        },
        ...product.options.map((option) => ({
          kind: "option" as const,
          id: option.id,
          productId: product.id,
          name: option.name,
          price: option.price,
          available: null,
        })),
      ]);
      const data = await page(entries.toSorted(entryOrder), context, input);
      return output({
        ...identity,
        ...metadata,
        section: input.section,
        total: data.total,
        nextCursor: data.nextCursor,
        items: data.entries,
        mappings: [],
      });
    },
  );
  server.registerTool(
    "get_pos_catalog",
    {
      description:
        "接続先Squareの有効な日本円店舗・全variation・親商品ごとのmodifier候補をページ取得する。locationId省略時は保存済み店舗、未選択ならkind=locationから選んで指定する。kind=productはvariation、kind=optionのproductIdはその親variation ID。nameは表示名、itemName/variationNameは翻訳していない登録原文で英語とは限らない。他商品のmodifierを流用せず、同名や価格差を推測で埋めない。owner/adminのtablecast:readが必要。limitは既定50、最大100。totalは全行数で、nextCursorがnullまで同条件で読む。取得中に内容が変わればPOS_CURSOR_STALEとなるため再取得する。Square商品は変更しない。",
      inputSchema: z.object(locationInput).strict(),
      outputSchema: {
        storeId: z.string(),
        ...pageOutput,
        entries: z.array(catalogEntry),
        issues: posCatalogSchema.shape.issues,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      const catalog = await getPosCatalog(services, actor, input.locationId);
      const entries: z.infer<typeof catalogEntry>[] = [
        ...catalog.locations.map((location) => ({ ...location, kind: "location" as const })),
        ...catalog.items.flatMap(({ options, ...product }) => [
          { ...product, kind: "product" as const },
          ...options.map((option) => ({
            ...option,
            kind: "option" as const,
            productId: product.id,
          })),
        ]),
      ];
      const data = await page(
        entries.toSorted(entryOrder),
        { storeId: actor.storeId, locationId: input.locationId ?? null, issues: catalog.issues },
        input,
      );
      return output({ storeId: actor.storeId, ...data, issues: catalog.issues });
    },
  );
  server.registerTool(
    "list_pos_devices",
    {
      description:
        "指定Square店舗で利用できる登録済み端末ID・登録名をページ取得する。locationId省略時は保存済み店舗。owner/adminのtablecast:readが必要。limitは既定50、最大100でnextCursorがnullまで読む。保存のdeviceIdには返されたIDを使い、既存端末を依頼なく変更しない。端末ペアリングや決済は行わない。",
      inputSchema: z.object(locationInput).strict(),
      outputSchema: { ...pageOutput, devices: z.array(posDeviceSchema), canPair: z.boolean() },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      const devices = await getPosDevices(services, actor, input.locationId);
      const data = await page(
        devices.devices.toSorted((left, right) => compare(left.id, right.id)),
        { storeId: actor.storeId, locationId: input.locationId ?? null, canPair: devices.canPair },
        input,
      );
      return output({
        devices: data.entries,
        total: data.total,
        nextCursor: data.nextCursor,
        canPair: devices.canPair,
      });
    },
  );
  server.registerTool(
    "save_pos_mappings",
    {
      description:
        "POS対応をdraftIdの下書きへ保存する。公開設定は変更しない。owner/adminのtablecast:write、最新expectedVersion、接続のconnectionIdが必要。候補IDの存在を検証し、親所属・価格の不一致は会計前照合で拒否する。最大5000対応の全置換。get_pos_settings(draftId,section=mappings)を全ページ取得して保持対象を全件含め、分割保存しない。共有local optionはkind+localIdで一件だけ。対象下書きの親商品候補を使い原文・価格を照合する。競合時は再取得し、保存後も同じdraftIdで全ページ再取得する。次にvalidate_draft/get_draft_diff/request_publicationを使い人のGUI承認で公開する。店舗端末はsave_pos_connection_settingsで別保存。Square商品・OAuth・決済は変更しない。",
      inputSchema: posMappingsUpdateSchema,
      outputSchema: {
        ...identitySchema,
        connection: posSettingsSchema.shape.connection,
        mappingCount: z.number().int().nonnegative(),
        draft: posSettingsSchema.shape.draft,
        publishedVersion: posSettingsSchema.shape.publishedVersion,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const settings = await savePosMappings(services, actor, input);
      return output({
        ...identity,
        connection: settings.connection,
        mappingCount: settings.mappings.length,
        draft: settings.draft,
        publishedVersion: settings.publishedVersion,
      });
    },
  );
  server.registerTool(
    "save_pos_connection_settings",
    {
      description:
        "接続済みPOSのlive店舗・端末だけを保存する。owner/adminのtablecast:writeと最新expectedRevisionが必要。候補はget_pos_catalog/list_pos_devicesで確認する。会計中の変更と古い版を拒否する。商品対応・下書き・公開メニュー・OAuth・決済は変更しない。",
      inputSchema: posConfigurationSchema,
      outputSchema: { ...identitySchema, connection: posSettingsSchema.shape.connection },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      const settings = await savePosSettings(services, actor, input);
      return output({ ...identity, connection: settings.connection });
    },
  );
}
