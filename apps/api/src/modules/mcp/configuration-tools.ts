import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { ensure } from "../../platform/errors";
import {
  appearanceSchema,
  bannerSchema,
  brandingSchema,
  themeFonts,
  themeParts,
} from "../appearance/model";
import { dietaryReasonsByKind, foodClassification } from "../catalog/food-model";
import { getCatalog } from "../catalog/queries";
import { configurationSchema } from "../configuration/model";
import { getDraft } from "../configuration/queries";
import {
  createDraft,
  discardDraft,
  updateDraft,
  validateDraft,
} from "../configuration/use-cases/drafts";
import { uploadedImageSchema, uploadImageSchema } from "../media/model";
import { uploadImage } from "../media/service";
import { statisticsQuerySchema, statisticsResultSchema } from "../statistics/model";
import { getStatistics } from "../statistics/service";
import { listVoices } from "../voice/catalog";
import { voiceListQuerySchema } from "../voice/model";
import { result } from "./result";
export function registerConfigurationTools(server: McpServer, services: ApiServices, actor: Actor) {
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
      const data = await getStatistics(services, actor, input);
      return { ...result(data), structuredContent: data };
    },
  );

  server.registerTool(
    "get_configuration",
    {
      description:
        "対象店舗・現在の公開設定・登録言語・意味訳と転写・入力schemaを取得する。資料の取り込み、設定提案、下書き作成の前に確認する。設定は変更しない。",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const catalog = await getCatalog(services, actor.storeId);
      return result({
        ...catalog,
        schema: z.toJSONSchema(configurationSchema),
        locales: catalog.configuration.languages,
        uiLocales: ["ja", "en", "zh-Hans", "ko"],
        fallback: ["en", "ja"],
        foodClassification: { ...foodClassification, dietaryReasons: dietaryReasonsByKind },
      });
    },
  );

  server.registerTool(
    "list_voices",
    {
      description:
        "接客の声を変更するときに、指定言語で利用できる標準音声IDを取得する。次のページはnextPageTokenをpageTokenへ渡す。接客文だけの変更では既存の声を保持する。",
      inputSchema: voiceListQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listVoices(services.env, actor, input)),
  );

  server.registerTool(
    "get_theme_spec",
    {
      description:
        "背景・ロゴ・チラシの画像生成と配置に使う現行schema、素材別の制作要件、公開部品とプレビュー導線を取得する。参考画像を使うテーマ制作の最初にget_configurationと併せて読む。画像生成そのものはクライアントの画像生成機能で行う。",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      result({
        storeId: actor.storeId,
        schema: z.toJSONSchema(
          z.object({
            branding: brandingSchema.optional(),
            appearance: appearanceSchema.optional(),
            banners: z.array(bannerSchema).max(12).optional(),
          }),
        ),
        publicParts: themeParts,
        fonts: Object.keys(themeFonts),
        artwork: [
          {
            role: "background",
            target: "appearance.assets → appearance.parts[part].image",
            suggestedSize: "1536×1024",
            brief:
              "文字なし。店の素材感を出し、中央80%は低コントラストで余白を残す。墨・木目・模様は端に寄せる。coverは切れるため重要な文字や絵を置かない。repeat素材は四辺が繋がるように作る。",
            placement:
              "全体screen、会話conversation、menuなどに割当。widthPercentは単発画像の相対幅、tileSizeは反復幅px。前面のbackgroundをtransparentにすると背面素材が見える。",
          },
          {
            role: "logo",
            target: "branding.logo",
            suggestedSize: "1024×1024 透過PNG",
            brief:
              "提供された公式ロゴをそのまま使う。新規制作を依頼された場合だけ生成し、生成案と明示。文字を正確に、透明な余白を8%程度残し、280px幅でも読める太さにする。背景・影・UIを焼き込まない。",
            placement:
              "正方形の店舗ロゴ。ヘッダーの横長画像はbranding.bannerへ別に設定する。メニューで大きく見せる場合はappearance.composition.mastheadのvisible/align/logoWidth/logoHeight/paddingを設定する。",
          },
          {
            role: "header-banner",
            target: "branding.banner",
            suggestedSize: "1200×300（4:1を例とし任意比率）",
            brief:
              "店舗ロゴと別の横長バナー。提供された画像を優先し、切り抜きや引き伸ばしをしない。",
            placement:
              "注文画面のヘッダーで画像全体を元の比率のまま表示する。バナー・店名・卓名は同じ横一列に表示する。",
          },
          {
            role: "membership-card",
            target: "branding.membershipCard.image",
            suggestedSize: "1600×640（5:2）",
            brief:
              "店舗会員カードの公開意匠。会員名・会員番号・認証用QRなどの個人情報は含めない。提供画像を優先し、会員名と入会日は画面側で表示する。",
            placement:
              "カード上部へ配置し、imageFit=containで全体表示、coverで枠いっぱいにする。toneはneutral/green/amber/violetの淡い背景と読める文字色を選ぶ。店舗デザインの下書きに保存し、通常の確認・承認後に反映する。",
          },
          {
            role: "member-app-icon",
            target: "branding.memberIcon",
            suggestedSize: "1024×1024（512px以上の正方形）",
            brief:
              "店舗別会員PWAの公開アイコン。小さくても識別できる店舗ロゴを使い、個人情報を含めない。",
            placement:
              "店舗会員証からホーム画面へ追加すると店舗名とこのアイコンを使い、同じ店舗の会員証を開く。未設定時はTableCastアイコンへ戻る。",
          },
          {
            role: "banner",
            target: "banners[].image",
            suggestedSize: "1536×1024 または 1536×768",
            brief:
              "実在する商品の確認済み画像・商品名を使う。料理を主役にし、店の書体・背景と揃える。文字は8%の安全余白内に置く。未確認の価格・期間限定・割引を創作しない。価格・翻訳・操作ラベルはHTMLにも残す。",
            placement:
              "画像全体を切り抜かず表示。hotspotsは完成画像の比率座標。composition.bannersは1/2列とgap、banner.span=fullは全幅。2列は狭いメニューで1列になる。",
          },
        ],
        workflow: [
          "クライアントの画像生成・編集機能を探索して素材ごとに生成する。TableCastのMCPは生成を代行しない。利用できなければ画像待ちと明示し、配色だけを画像テーマ完成と報告しない。",
          "完成画像を目視確認し、upload_imageへ実ファイルまたは実バイト列を渡す。imageSource.generated=trueとimageKind=illustrationを付け、返された画像参照へ日英altを追加する。",
          "既存の全configurationを保ち、テーマの項目だけ更新する。update_draftに最新expectedVersionとinstructionFormatVersion:1を渡す。validate_draft、get_draft_diffで商品・接客の保持を確認する。",
          "管理画面の実注文プレビューで日英・縦横、ロゴ寸法、背景と文字、チラシ領域と商品詳細を確認する。生成モックアップを実装済み画面の証拠にしない。",
        ],
        editorUrl: `${services.env.TABLECAST_PUBLIC_ORIGIN}/admin/stores/${encodeURIComponent(actor.storeId)}/design`,
      }),
  );

  server.registerTool(
    "upload_image",
    {
      description:
        "店舗設定用の商品・店舗ロゴ・テーマ装飾・チラシ画像・会員カード・会員PWAアイコン・クーポン券面を取り込む。画像テーマは先にget_theme_specで素材別の寸法と配置を確認し、クライアントの画像生成機能で別々に制作する。ChatGPTで生成・添付した画像はfileへ渡す（fileParams対応）。Base64クライアントはfileの代わりにdataとmimeTypeを使う。PNG/JPEG/WebP、5MiB・1600万画素まで。生成画像はimageSource.generated=true、imageKind=illustrationとし出所の説明を付ける。返されたimageKey・imageKind・imageSourceをupdate_draftの商品、branding.logo、branding.banner、branding.membershipCard.image、branding.memberIcon、appearance.assets、bannersの画像へ設定する。ロゴ・装飾・チラシにはaltの日英説明も設定する。画像URLは公開配信される。公開メニューは人の承認まで変更しない。",
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
      const uploaded = await uploadImage(services, actor, input);
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
    async () => result(await createDraft(services, actor)),
  );

  server.registerTool(
    "update_draft",
    {
      description:
        "依頼された店名・店舗ロゴ（branding）・テーマ（appearance）・チラシ（banners）・商品・価格・売切・画像・選択肢・翻訳・プラン・接客の変更を、最新expectedVersionと全configurationで下書きへ保存する。部分patchではないため他の商品と言語データを保持する。languagesにBCP 47コードを登録でき、商品のtextの各言語にはdisplayName（意味訳）とtransliteration（転写）の両方が必須。英語の日本語転写は長音記号付きヘボン式とし、銘柄は固有名を保持し、分類や調理法は意味を訳す。料理名・材料・調理法・個数等を独断で短縮・省略せず、日本酒や刺身などには何か分かる説明を加える。英語の商品名と転写はsentence caseに揃え、固有名詞と略語の正式表記は保持する。精米歩合や製法の詳細もdescriptionに保持する。食事制限はfoodInfoのbase・components・defaultComponentIdsと選択肢のfoodChanges.add/removeで設定する。アレルゲンIDは日本の29品目のenumだけで、未登録はunknown。分類外IDと自由文basisは受け付けない。4食事区分のyes/noにはreasonsのenumを指定し、認証はhalalCertification、共用設備はcrossContactSourcesで設定する。削除した具材以外に残る成分を消さない。条件は選択肢のconditions.version=2とrequires/excludesのoption・and・or・notで表す。既存conditionsを落とさず、解除はrequires/excludesをnullにする。conditionsと非空の旧requires/excludes配列は併記しない。次にvalidate_draftとget_draft_diffで確認する。提供資料と設定値に従い、価格や食事制限の情報は推測しない。公開設定は変更しない。",
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
        await updateDraft(services, actor, draftId, {
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
      result(await validateDraft(services, actor, draftId, expectedVersion)),
  );

  server.registerTool(
    "get_draft_diff",
    {
      description:
        "編集中の下書きの全設定・最新版・公開版との差分を取得する。作業再開、版競合の解消、変更報告に使う。設定は変更しない。",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => result(await getDraft(services, actor, draftId)),
  );

  server.registerTool(
    "request_publication",
    {
      description:
        "利用者が公開申請を依頼した場合に、検証済み下書きの対象版と人が確認するreviewUrlを返す。実際の公開は管理画面の明示承認で完了する。返されたURLを利用者へ案内し、まだ公開済みと報告しない。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
    },
    async ({ draftId, expectedVersion }) => {
      const draft = await getDraft(services, actor, draftId);
      ensure(draft.status === "ready" && draft.version === expectedVersion, "DRAFT_NOT_READY");
      return result({
        draftId,
        version: draft.version,
        status: "human_approval_required",
        reviewUrl: `${services.env.TABLECAST_PUBLIC_ORIGIN}/admin/live?storeId=${encodeURIComponent(actor.storeId)}&draftId=${encodeURIComponent(draftId)}`,
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
      result(await discardDraft(services, actor, draftId, expectedVersion)),
  );
}
