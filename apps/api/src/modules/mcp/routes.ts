import { listCouponRules, listIssuedCoupons, listRewardMembers } from "../customer-coupons/queries";
import {
  saveCouponRule,
  issueCustomerCoupon,
  revokeCustomerCoupon,
} from "../customer-coupons/service";
import {
  couponPageSchema,
  couponDefinitionSchema,
  issueCouponSchema,
  rewardMembersSchema,
  revokeCouponSchema,
} from "../customer-coupons/model";
import { getPointPolicy } from "../customer-points/queries";
import { setPointPolicy } from "../customer-points/service";
import { pointPolicySchema } from "../customer-points/model";
import { getStatistics } from "../statistics/service";
import { statisticsQuerySchema, statisticsResultSchema } from "../statistics/model";
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
    "get_point_policy",
    {
      description: "店舗のポイント付与設定を取得する。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(await getPointPolicy(c.get("services"), actor)),
  );
  server.registerTool(
    "set_point_policy",
    {
      description: "将来の来店に適用するポイント設定を変更する。",
      inputSchema: pointPolicySchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => result(await setPointPolicy(c.get("services"), actor, input)),
  );
  server.registerTool(
    "list_coupon_rules",
    {
      description: "店舗のクーポン発行ルールをページ取得する。",
      inputSchema: couponPageSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listCouponRules(c.get("services"), actor, input)),
  );
  server.registerTool(
    "save_coupon_rule",
    {
      description:
        "画像と日英条件を持つクーポン発行ルールを作成・更新する。発行済み券は変更しない。",
      inputSchema: couponDefinitionSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => result(await saveCouponRule(c.get("services"), actor, input)),
  );
  server.registerTool(
    "list_reward_members",
    {
      description: "特典の発行先を選ぶため店舗会員のIDと表示名を検索する。個人記憶は含まない。",
      inputSchema: rewardMembersSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listRewardMembers(c.get("services"), actor, input)),
  );
  server.registerTool(
    "list_issued_coupons",
    {
      description: "店舗が発行した券と状態をページ取得する。",
      inputSchema: couponPageSchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listIssuedCoupons(c.get("services"), actor, input)),
  );
  server.registerTool(
    "issue_coupon",
    {
      description: "手動発行ルールから指定会員へ券を発行する。同じidempotencyKeyで再送する。",
      inputSchema: issueCouponSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (input) => result(await issueCustomerCoupon(c.get("services"), actor, input)),
  );
  server.registerTool(
    "revoke_coupon",
    {
      description: "未使用券を理由付きで取り消す。ポイントの返却は別途訂正が必要。",
      inputSchema: revokeCouponSchema.extend({ couponId: z.string().min(1) }).shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async (input) =>
      result(await revokeCustomerCoupon(c.get("services"), actor, input.couponId, input.reason)),
  );
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
    "get_statistics",
    {
      description:
        "期間内に閉卓した通常来店の統計を取得する。まずsummaryで母数・売上・除外条件を確認し、productsまたはmodifiersで注文傾向を調べる。from/toはUTC offset付き日時で開始を含み終了を含まない。ページはID順で、続きは同じ条件とnextCursorをcursorへ渡す。owner/adminの読取りscopeで利用でき、設定は変更しない。",
      inputSchema: statisticsQuerySchema,
      outputSchema: statisticsResultSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const data = await getStatistics(c.get("services"), actor, input);
      return { ...result(data), structuredContent: data };
    },
  );

  server.registerTool(
    "get_configuration",
    {
      description:
        "対象店舗・現在の公開設定・日英データ・入力schemaを取得する。資料の取り込み、設定提案、下書き作成の前に確認する。設定は変更しない。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
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
        "接客の声を変更するときに、指定言語で利用できる標準音声IDを取得する。次のページはnextPageTokenをpageTokenへ渡す。接客文だけの変更では既存の声を保持する。",
      inputSchema: voiceListQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listVoices(c.env, actor, input)),
  );
  server.registerTool(
    "upload_image",
    {
      description:
        "店舗設定用の商品・店舗ロゴ・テーマ装飾・チラシ画像・クーポン券面を取り込む。ChatGPTで生成・添付した画像はfileへ渡す（fileParams対応）。Base64クライアントはfileの代わりにdataとmimeTypeを使う。PNG/JPEG/WebP、5MiB・1600万画素まで。生成画像はimageSource.generated=true、imageKind=illustrationとし出所の説明を付ける。返されたimageKey・imageKind・imageSourceをupdate_draftの商品、branding.logo、appearance.assets、bannersの画像へ設定する。ロゴ・装飾・チラシにはaltの日英説明も設定する。画像URLは公開配信される。公開メニューは人の承認まで変更しない。",
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
      description:
        "設定を依頼された場合に現在の公開版から下書きを作る。提案・分析だけでは呼ばない。編集中のdraftIdがある場合はget_draft_diffで取得して再利用する。公開設定は変更しない。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async () => result(await createDraft(c.get("services"), actor)),
  );
  server.registerTool(
    "update_draft",
    {
      description:
        "依頼された店名・店舗ロゴ（branding）・テーマ（appearance）・チラシ（banners）・商品・価格・売切・画像・選択肢・翻訳・プラン・接客の変更を、最新expectedVersionと全configurationで下書きへ保存する。部分patchではないため他の商品と日英データを保持する。条件は選択肢のconditions.version=2とrequires/excludesのoption・and・or・notで表す。既存conditionsを落とさず、解除はrequires/excludesをnullにする。conditionsと非空の旧requires/excludes配列は併記しない。次にvalidate_draftとget_draft_diffで確認する。架空店の試作値は創作と明示し、実店舗の価格や安全情報は推測しない。公開設定は変更しない。",
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
      description:
        "保存後の下書きを最新expectedVersionで検証し、価格・参照・日英の読上げ名・プラン等のエラーと状態を返す。状態を更新するため読取り専用ではない。修正後は再検証し、get_draft_diffで差分を確認する。readyは公開済みではない。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ draftId, expectedVersion }) =>
      result(await validateDraft(c.get("services"), actor, draftId, expectedVersion)),
  );
  server.registerTool(
    "get_draft_diff",
    {
      description:
        "編集中の下書きの全設定・最新版・公開版との差分を取得する。作業再開、版競合の解消、変更報告に使う。設定は変更しない。",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => result(await getDraft(c.get("services"), actor, draftId)),
  );
  server.registerTool(
    "request_publication",
    {
      description:
        "利用者が公開申請を依頼した場合に、検証済み下書きの対象版と人が確認するreviewUrlを返す。実際の公開は管理画面の明示承認で完了する。返されたURLを利用者へ案内し、まだ公開済みと報告しない。",
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
      description:
        "利用者が不要とした未公開下書きを最新expectedVersionで破棄する。版競合の回避や新しい下書き作成の前処理として勝手に破棄しない。",
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
