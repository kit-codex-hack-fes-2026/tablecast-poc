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
import { registerGameSchema, gamePackageSchema } from "../games/model";
import { getGame, getGameVersion, listGames, readGamePackage } from "../games/queries";
import { registerGame, validateGame } from "../games/service";
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
    "get_game_spec",
    {
      description: "卓上ゲーム制作のパッケージ仕様と実行APIを取得する。制作前に必ず読む。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () =>
      result({
        schema: z.toJSONSchema(gamePackageSchema),
        protocol: 1,
        instructions: [
          "HTMLはbody内のマークアップ、CSS、バンドル済みJavaScriptを分ける。画像・音声・3Dモデルはdata URLなどで同梱し、CDN・fetch・外部importを使わない。合計2MBまで。",
          "const context = await tablecast.ready; でlocale(ja/en)、players、state、previewを受け取る。生成コードへ認証情報・注文API・店舗IDは渡さない。",
          "manifest.capabilitiesにstateを宣言した場合だけawait tablecast.save(state)で16KiB以下のJSONを保存できる。tablecast.exit()で終了する。",
          "sandboxのopaque originで動作し、親DOM・Cookie・localStorage・マイク・外部通信・eval・Workerは使えない。音声AI APIはapiVersion 1では提供しない。",
          "参加人数内で開始・順番交代・結果発表まで遊べるようにする。日英表示、スキップ、ソフトドリンク参加、iPadのタッチ操作とreduced motionに対応する。客向けの自由文入力欄は作らない。",
          "register_gameは毎回変更不可の新しい版を作る。validate_game後、reviewUrlで人が試遊して承認する。MCPは公開できない。修正は再登録する。",
        ],
        example: {
          html: '<button id="finish"></button>',
          css: "button { min-height: 48px; }",
          javascript:
            'tablecast.ready.then(({locale}) => { const b = document.getElementById("finish"); b.textContent = locale === "ja" ? "終了" : "Finish"; b.onclick = () => tablecast.exit(); });',
        },
      }),
  );
  server.registerTool(
    "list_games",
    {
      description: "店舗のゲームと公開版を最大50件取得する。nextがあればafterに渡す。",
      inputSchema: { after: z.string().max(60).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ after }) => result(await listGames(c.get("services"), actor, after)),
  );
  server.registerTool(
    "get_game",
    {
      description:
        "ゲームの版と状態を20件ずつ取得する。nextBeforeがあればbeforeへ渡す。版のソースはget_game_sourceで取得する。",
      inputSchema: { gameId: z.string().max(60), before: z.uuid().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ gameId, before }) => result(await getGame(c.get("services"), actor, gameId, before)),
  );
  server.registerTool(
    "get_game_source",
    {
      description: "指定版の制作ソースを取得する。",
      inputSchema: { gameId: z.string().max(60), versionId: z.uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ gameId, versionId }) => {
      const version = await getGameVersion(c.get("services"), actor, gameId, versionId);
      return result({
        versionId,
        package: await readGamePackage(c.get("services"), version.package_key),
      });
    },
  );
  server.registerTool(
    "register_game",
    {
      description: "店舗のゲームを変更不可の新しい下書き版として登録する。公開は変更しない。",
      inputSchema: registerGameSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) => result(await registerGame(c.get("services"), actor, input)),
  );
  server.registerTool(
    "validate_game",
    {
      description:
        "ゲームの仕様・容量・権限を検証し、試遊と公開承認の管理画面を返す。ゲームの動作確認は管理画面で行う。",
      inputSchema: { gameId: z.string().max(60), versionId: z.uuid() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ gameId, versionId }) =>
      result(await validateGame(c.get("services"), actor, gameId, versionId)),
  );

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
        "店名（storeName）・カテゴリ・商品画像・カスタマイズ・翻訳・プラン・キャストの変更を下書きへ一括保存する。架空店の試作依頼では提案した店名・メニュー・価格を保存できる。実店舗の未知の安全情報は推測しない。",
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int(),
        configuration: configurationSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ draftId, expectedVersion, configuration }) =>
      result(
        await updateDraft(c.get("services"), actor, draftId, { expectedVersion, configuration }),
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
