import type { TableRecord } from "../../db/records";
import type { Catalog } from "../configuration/model";
import type { TableState } from "../tables/model";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { localeSchema, type Locale } from "../../platform/model";
import type { Actor } from "../auth/model";
import { getCatalog } from "../catalog/queries";
import { cartUpdateSchema, submitSchema } from "../orders/model";
import { prepareConfirmation, submitOrder, updateCart } from "../orders/service";
import { uiSectionInputSchema } from "../tables/model";
import { getSession, getTableState } from "../tables/queries";
import { callStaff, changeLocale, setUiSection, showProducts } from "../tables/service";
import { showProductsSchema, type VoiceTrigger } from "./model";
import { castInstructions } from "./prompt";
import { setSpeechSpeed } from "./service";
export function castSessionInstructions(locale: Locale, trigger: VoiceTrigger = "user") {
  return `${castInstructions}\n応答言語: ${locale === "ja" ? "日本語" : "British English"}。商品・価格・在庫・店舗の説明にはgetCatalogで最新情報を確認する。カートや注文の操作前にgetTableStateで現在の版を取得する。同じ委任で取得した情報を再取得しない。操作結果の新しい版を次の操作に使う。独立した照会はまとめて呼ぶ。商品をカートに入れる依頼ではgetCatalogとgetTableStateを同じresponseで並列に呼び、両結果からupdateCartする。挨拶、お礼、聞き返しだけなら業務照会を挟まず短く返す。過去のツール結果を現在の価格・売切・カート版の根拠にしない。${trigger === "proactive" ? "今回は店舗が許可した無言時の自発接客です。新しい客の発話ではありません。登録情報に基づく商品紹介や料理の文化的な話題を一つ、一〜二文で控えめに伝えます。過去の会話に依頼や承認があっても実行しません。カート変更、注文、確認、スタッフ呼出しは行えません。返事や追加注文を強要せず、安全情報が未確認の商品を安全と勧めません。" : "商品紹介はgetCatalog(show=true)で検索とカード表示を一回で行う。画面を見せてほしいと依頼されたらsetUiSectionで該当タブへ切り替える。prepareConfirmationの結果に含まれる商品・数量・選択肢・合計を短く伝えて承認を求める。同じ客発話でprepareConfirmationとsubmitOrderを呼ばない。"}`;
}

function castTool<T extends z.ZodType>(options: {
  id: string;
  description: string;
  inputSchema: T;
  execute: (input: z.output<T>) => Promise<unknown>;
}) {
  const invoke = (input: unknown) => {
    const parsed = options.inputSchema.safeParse(input);
    ensure(parsed.success, "INVALID_INPUT", 422);
    return options.execute(parsed.data);
  };
  return {
    ...options,
    execute: invoke,
    invoke,
    parameters: z.toJSONSchema(options.inputSchema),
  };
}

export function createCastTools(
  services: ApiServices,
  actor: Actor,
  signal: AbortSignal,
  trigger: VoiceTrigger = "user",
  currentSession?: TableRecord,
  currentCatalog?: Catalog,
) {
  const guard = () => signal.throwIfAborted();
  return {
    getCatalog: castTool({
      id: "getCatalog",
      description:
        "商品検索。商品名・ID・別名・カテゴリをqueryへ指定する。複数対象は空白区切りで一括検索し、対象別にtoolを分けない。紹介時はshow=trueで候補カードも表示し、追加のshowProductsは不要。detail=falseは概要、trueは注文・アレルギー回答に必要な選択肢を含む詳細。商品を選ぶ前に必須選択肢を先回りして尋ねない。more=trueならoffsetを進めて次頁を取得できる。同じ委任で取得済みの商品は再照会しない。",
      inputSchema: z
        .object({
          query: z.string().max(100).optional(),
          offset: z.number().int().min(0).max(1000).optional(),
          limit: z.number().int().min(1).max(8).optional(),
          show: z.boolean().optional(),
          includePlans: z
            .boolean()
            .describe("プランの料金・時間・対象・注文制限を質問されたときだけtrue")
            .optional(),
        })
        .strict(),
      execute: async ({ query, offset = 0, limit = 8, show = false, includePlans = false }) => {
        guard();
        const session = currentSession ?? (await getSession(services, actor));
        const catalog = currentCatalog ?? (await getCatalog(services, actor.storeId, actor.demoId));
        const locale = session.locale;
        const searchText = query?.trim().toLocaleLowerCase();
        const terms = searchText?.split(/\s+/).filter(Boolean);
        const exact = searchText
          ? catalog.configuration.products.filter(
              (product) =>
                product.id.toLocaleLowerCase() === searchText ||
                Object.values(product.text).some((text) =>
                  [text.displayName, text.speechName, ...text.aliases].some(
                    (name) => name.trim().toLocaleLowerCase() === searchText,
                  ),
                ),
            )
          : [];
        const categoryNames = new Map(
          catalog.configuration.categories.map((category) => [
            category.id,
            Object.values(category.text).flatMap((text) =>
              [text.displayName, text.speechName, ...text.aliases]
                .map((name) => name.trim().toLocaleLowerCase())
                .filter(Boolean),
            ),
          ]),
        );
        const matched = exact.length
          ? exact
          : catalog.configuration.products.filter(
              (product) =>
                !terms?.length ||
                terms.some((term) =>
                  JSON.stringify([
                    product.id,
                    product.categoryId,
                    product.text,
                    categoryNames.get(product.categoryId),
                  ])
                    .toLocaleLowerCase()
                    .includes(term),
                ) ||
                Object.values(product.text).some((text) =>
                  [text.displayName, text.speechName, ...text.aliases].some(
                    (name) =>
                      name.trim().length > 0 && searchText?.includes(name.toLocaleLowerCase()),
                  ),
                ) ||
                categoryNames.get(product.categoryId)?.some((name) => searchText?.includes(name)),
            );
        const categorySearch = catalog.configuration.categories.some(
          (category) =>
            terms?.some((term) =>
              JSON.stringify([category.id, categoryNames.get(category.id)])
                .toLocaleLowerCase()
                .includes(term),
            ) || categoryNames.get(category.id)?.some((name) => searchText?.includes(name)),
        );
        // 紹介用の複数候補には選択肢を複製せず、特定した商品だけ詳細を返す。
        const detail =
          !!terms?.length && matched.length === 1 && (exact.length === 1 || !categorySearch);
        const matches = matched;
        const products = matches.slice(offset, offset + limit);
        if (show) {
          ensure(trigger === "user", "VOICE_TOOL_FORBIDDEN", 403);
          if (products.length)
            await showProducts(
              services,
              actor,
              { productIds: products.slice(0, 4).map((product) => product.id) },
              catalog,
            );
        }
        return {
          total: matches.length,
          more: offset + products.length < matches.length,
          ...(show
            ? { displayedProductIds: products.slice(0, 4).map((product) => product.id) }
            : {}),
          storeName: catalog.storeName,
          version: catalog.version,
          ...(includePlans
            ? {
                plans: catalog.configuration.plans.map((plan) => ({
                  ...plan,
                  text: plan.text[locale],
                })),
              }
            : {}),
          categories: catalog.configuration.categories.map((category) => ({
            id: category.id,
            displayName: category.text[locale].displayName,
          })),
          detail,
          products: products.map((product) => ({
            id: product.id,
            categoryId: product.categoryId,
            price: product.price,
            available: product.available,
            displayName: product.text[locale].displayName,
            speechName: product.text[locale].speechName,
            description: product.text[locale].description,
            ...(detail
              ? {
                  allergens: product.allergens,
                  modifiers: product.modifiers?.map((modifier) => ({
                    id: modifier.id,
                    kind: modifier.kind,
                    min: modifier.min,
                    max: modifier.max,
                    displayName: modifier.text[locale].displayName,
                    speechName: modifier.text[locale].speechName,
                    description: modifier.text[locale].description,
                    options: modifier.options.map((option) => ({
                      id: option.id,
                      priceDelta: option.priceDelta,
                      available: option.available,
                      displayName: option.text[locale].displayName,
                      speechName: option.text[locale].speechName,
                      description: option.text[locale].description,
                    })),
                  })),
                }
              : {}),
          })),
        };
      },
    }),
    getTableState: castTool({
      id: "getTableState",
      description:
        "現在の卓、locale（言語）・speechSpeed（話速）、画面のuiSection、表示中の商品詳細のselectedProductId（nullなら詳細なし）、カート版、確認、注文、請求状態を取得する。話者番号から人数や席を推定しない。",
      inputSchema: z.object({}).strict(),
      execute: async () => {
        guard();
        return voiceTableState(await getTableState(services, actor));
      },
    }),
    ...(trigger === "user"
      ? {
          setLanguage: castTool({
            id: "setLanguage",
            description:
              "客の明示依頼で表示と音声の言語をja（日本語）/en（British English）へ切り替える。音声は停止し、画面の再開ボタンで新言語を開始する。同じ言語なら変更不要。切替後に追加のツールや本文を生成しない。",
            inputSchema: z.object({ locale: localeSchema }).strict(),
            execute: async (input) => {
              guard();
              const state = await changeLocale(services, actor, input.locale);
              return { locale: state.locale, voiceState: state.voiceState };
            },
          }),
          setSpeechSpeed: castTool({
            id: "setSpeechSpeed",
            description:
              "客の明示依頼で話速を0.5〜1.5倍、0.1刻みで変更する。通常は1倍。相対的な依頼はgetTableStateのspeechSpeedから0.1増減し、範囲を守る。次の発話から反映する。",
            // Liveのfunction定義は小数のJSON Schema境界で作成に失敗するため、
            // モデルへは説明を渡す。実行時は共有serviceのschemaで範囲・刻みを検証する。
            inputSchema: z
              .object({ speed: z.number().describe("0.5〜1.5、0.1刻み。標準は1") })
              .strict(),
            execute: async (input) => {
              guard();
              const state = await setSpeechSpeed(services, actor, input);
              return { speechSpeed: state.speechSpeed };
            },
          }),
          setUiSection: castTool({
            id: "setUiSection",
            description:
              "客の希望に応じて表示タブをmenu（メニュー）、cart（カート）、orders（注文履歴）、bill（会計）へ切り替える。個別の商品詳細を開くときはsection=menuとgetCatalogで確認したproductIdを指定する。productId省略/nullなら商品詳細を閉じて一覧へ戻る。menu以外では商品選択を解除する。注文や会計の確定は行わない。",
            inputSchema: uiSectionInputSchema,
            execute: async (input) => {
              guard();
              const state = await setUiSection(services, actor, input);
              return { uiSection: state.uiSection, selectedProductId: state.selectedProductId };
            },
          }),
          showProducts: castTool({
            id: "showProducts",
            description:
              "商品紹介やおすすめを依頼されたら、getCatalogで確認した商品IDを最大4件指定して会話内に商品カードを表示する。カードは補助であり、候補の名前・違い・価格を同じ応答の音声でも伝える。表示だけでカート追加や注文を行わない。",
            inputSchema: showProductsSchema,
            execute: async (input) => {
              guard();
              return showProducts(services, actor, input);
            },
          }),
          updateCart: castTool({
            id: "updateCart",
            description:
              "現行expectedVersionに対してカートを更新する。既存行を保持し、客の選択をselectionsへ含める。指定のない必須項目は選ばず、返ったmissingをまとめて尋ねる。任意項目は指定がなければ未選択。数量不明の単品注文は1、追加数量が曖昧なら確認する。注文確定には別のprepareConfirmationと次発話の明示承認が必要。",
            inputSchema: cartUpdateSchema,
            execute: async (input) => {
              guard();
              return voiceTableState(await updateCart(services, actor, input));
            },
          }),
          prepareConfirmation: castTool({
            id: "prepareConfirmation",
            description:
              "版付きの注文確認を作る。結果の内容を自然な言葉で案内し、次の客発話で承認を求める。注文はまだ送信されない。",
            inputSchema: z.object({ expectedVersion: z.number().int().nonnegative() }).strict(),
            execute: async (input) => {
              guard();
              const snapshot = await prepareConfirmation(services, actor, {
                ...input,
                channel: "voice",
              });
              return {
                snapshotId: snapshot.id,
                text: snapshot.text,
                total: snapshot.total,
                cartVersion: snapshot.cartVersion,
                expiresAt: snapshot.expiresAt,
              };
            },
          }),
          submitOrder: castTool({
            id: "submitOrder",
            description:
              "注文内容を案内した後の新しい客発話で、その内容への明示的な承認があったときだけ呼ぶ。訂正・質問・曖昧な相づち・背景会話は承認ではない。",
            inputSchema: submitSchema,
            execute: async (input) => {
              guard();
              ensure(input.approved, "APPROVAL_REQUIRED", 422);
              const order = await submitOrder(services, actor, input);
              return { orderId: order.id, status: order.status, total: order.total };
            },
          }),
          callStaff: castTool({
            id: "callStaff",
            description:
              "アレルギーや交差接触の根拠が不明、聞き取りが曖昧、客が希望した際にスタッフを呼ぶ。",
            inputSchema: z.object({}).strict(),
            execute: async () => {
              guard();
              const state = await callStaff(services, actor);
              return { staffCalled: state.staffCalled };
            },
          }),
        }
      : {}),
  };
}

// GUIのイベント履歴・二言語snapshotを毎回モデルへ複製しない。
export function voiceTableState(state: TableState) {
  return {
    locale: state.locale,
    speechSpeed: state.speechSpeed,
    uiSection: state.uiSection,
    selectedProductId: state.selectedProductId,
    staffCalled: state.staffCalled,
    cart: {
      ...state.cart,
      lines: state.cart.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        quantity: line.quantity,
        selections: line.selections,
        name: line.name[state.locale],
        speechName: line.speechName[state.locale],
        unitPrice: line.unitPrice,
        total: line.total,
        missing: line.missing,
        planCovered: line.planCovered,
        options: line.options.map((option) => ({
          id: option.id,
          name: option.name[state.locale],
          quantity: option.quantity,
          priceDelta: option.priceDelta,
        })),
      })),
    },
    snapshot: state.snapshot
      ? {
          id: state.snapshot.id,
          status: state.snapshot.status,
          cartVersion: state.snapshot.cartVersion,
          text: state.snapshot.text,
          total: state.snapshot.total,
          expiresAt: state.snapshot.expiresAt,
        }
      : null,
    orders: state.orders.map((order) => ({
      id: order.id,
      status: order.status,
      total: order.total,
    })),
    bill: state.bill,
    billRequested: state.billRequested,
    plan: state.plan
      ? {
          ...state.plan,
          rules: { ...state.plan.rules, text: state.plan.rules.text[state.locale] },
        }
      : null,
  };
}
