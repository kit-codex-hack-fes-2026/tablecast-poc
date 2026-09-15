import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isAPIError } from "better-auth/api";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { getCatalog } from "../catalog/queries";
import { configurationSchema } from "../configuration/model";
import {
  createDraft,
  discardDraft,
  getDraft,
  updateDraft,
  validateDraft,
} from "../configuration/service";
import { listVoices } from "../voice/catalog";
import { uploadImageSchema, uploadedImageSchema } from "../media/model";
import { uploadImage } from "../media/service";
import { voiceListQuerySchema } from "../voice/model";
import { resolveMcpActor } from "./service";
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

export const mcpRoutes = new Hono<ApiEnv>().all("/", async (c) => {
  let principal;
  c.set("errorPhase", "mcp.authentication");
  try {
    principal = await c
      .get("services")
      .auth.api.tablecastMcpPrincipal({ headers: c.req.raw.headers });
  } catch (error) {
    if (!isAPIError(error) || ![401, 403].includes(error.statusCode)) throw error;
    c.error = error;
    return c.json({ error: "invalid_token" }, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${c.env.TABLECAST_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    });
  }
  c.set("errorPhase", "mcp.store");
  const actor = await resolveMcpActor(c.get("services"), principal, c.req.query("storeId"));
  c.set("errorPhase", "mcp.registration");
  const server = new McpServer({ name: "tablecast-settings", version: "0.1.0" });

  server.registerTool(
    "get_configuration",
    { description: "店舗の公開設定、日英データ、入力schemaを取得する。", inputSchema: {} },
    async () =>
      result({
        ...(await getCatalog(c.get("services"), actor.storeId)),
        schema: z.toJSONSchema(configurationSchema),
        locales: ["ja", "en"],
      }),
  );
  server.registerTool(
    "list_voices",
    {
      description:
        "指定した言語を主言語とするInworldの標準音声を取得する。次のページは返されたnextPageTokenをpageTokenへ渡して取得する。",
      inputSchema: voiceListQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listVoices(c.env, actor, input)),
  );
  server.registerTool(
    "upload_image",
    {
      description:
        "店舗設定用の商品画像を取り込む。ChatGPTで生成・添付した画像はfileへ渡す（fileParams対応）。Base64クライアントはfileの代わりにdataとmimeTypeを使う。PNG/JPEG/WebP、5MiB・1600万画素まで。生成画像はimageSource.generated=true、imageKind=illustrationとし出所の説明を付ける。返されたimageKey・imageKind・imageSourceをupdate_draftの商品へ設定する。画像URLは公開配信される。公開メニューは人の承認まで変更しない。",
      inputSchema: uploadImageSchema.shape,
      outputSchema: uploadedImageSchema.shape,
      _meta: { "openai/fileParams": ["file"] },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const uploaded = await uploadImage(c.get("services"), actor, input);
      return { ...result(uploaded), structuredContent: uploaded };
    },
  );
  server.registerTool(
    "create_draft",
    {
      description: "現在の公開版から変更下書きを作る。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async () => result(await createDraft(c.get("services"), actor)),
  );
  server.registerTool(
    "update_draft",
    {
      description:
        "店名（storeName）・カテゴリ・商品画像・カスタマイズ・翻訳・プラン・キャストの変更を下書きへ一括保存する。条件は選択肢のconditions.version=2とrequires/excludesのoption・and・or・notで表す。既存conditionsを落とさず、解除はrequires/excludesをnullにする。conditionsと非空の旧requires/excludes配列は併記しない。架空店の試作依頼では提案した店名・メニュー・価格を保存できる。実店舗の未知の安全情報は推測しない。",
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int(),
        configuration: configurationSchema,
        instructionFormatVersion: z
          .literal(1)
          .optional()
          .describe("文書形式を保存・更新するときは1。旧文字列のみの下書きでは省略可。"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ draftId, expectedVersion, configuration, instructionFormatVersion }) =>
      result(
        await updateDraft(c.get("services"), actor, draftId, {
          expectedVersion,
          configuration,
          instructionFormatVersion,
        }),
      ),
  );
  server.registerTool(
    "validate_draft",
    {
      description: "価格、参照、日英の読上げ名、プランの整合性を検証する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
    },
    async ({ draftId, expectedVersion }) =>
      result(await validateDraft(c.get("services"), actor, draftId, expectedVersion)),
  );
  server.registerTool(
    "get_draft_diff",
    {
      description: "公開版との差分と価格・安全情報の変更箇所を取得する。",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => result(await getDraft(c.get("services"), actor, draftId)),
  );
  server.registerTool(
    "request_publication",
    {
      description: "公開対象版と人が確認する管理画面を返す。公開は管理画面の明示承認で完了する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
    },
    async ({ draftId, expectedVersion }) => {
      const draft = await getDraft(c.get("services"), actor, draftId);
      ensure(draft.status === "ready" && draft.version === expectedVersion, "DRAFT_NOT_READY");
      return result({
        draftId,
        version: draft.version,
        status: "human_approval_required",
        reviewUrl: `${c.env.TABLECAST_PUBLIC_ORIGIN}/admin/live?storeId=${encodeURIComponent(actor.storeId)}&draftId=${encodeURIComponent(draftId)}`,
      });
    },
  );
  server.registerTool(
    "discard_draft",
    {
      description: "不要な未公開下書きを破棄する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ draftId, expectedVersion }) =>
      result(await discardDraft(c.get("services"), actor, draftId, expectedVersion)),
  );
  c.set("errorPhase", "mcp.transport");
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});
