import { z } from "zod";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { DisplayCurrencyContext } from "../currency/model";
import { ensure } from "../../platform/errors";
import { localeSchema, id as productIdSchema } from "../../platform/model";
import { getProductFoodInformation } from "../catalog/food-service";
import { resolveText } from "../catalog/localization";
import { foodQuerySchema } from "../catalog/model";
import { getCatalog } from "../catalog/queries";
import { menuSearchPage } from "../catalog/search";
import { maxConfigurationProducts } from "../configuration/model";
import { approximateAmounts, currencyMetadata } from "../currency/display";
import { displayCurrencyCodeSchema } from "../currency/model";
import { customerSuggestionsSchema, saveCustomerMemorySchema } from "../customer-memory/model";
import { customerRecommendationContext, customerSuggestions } from "../customer-memory/queries";
import { saveAutomaticCustomerMemory } from "../customer-memory/use-cases/sources";
import { cartUpdateSchema, submitSchema } from "../orders/model";
import { updateCart } from "../orders/use-cases/cart";
import { prepareConfirmation, submitOrder } from "../orders/use-cases/confirmation";
import { getServiceGuidance } from "../tables/assistance-queries";
import { menuSearchInputSchema, staffCallInputSchema, uiSectionInputSchema } from "../tables/model";
import { getSession, getTableState } from "../tables/queries";
import { showServiceGuidance } from "../tables/use-cases/assistance";
import {
  callStaff,
  changeLocale,
  setUiSection,
  showProducts,
} from "../tables/use-cases/presentation";
import { showProductsSchema, type VoiceTrigger } from "./model";
import { setSpeechSpeed } from "./service";
import { castTool } from "./tool";
import { voiceToolDescriptions } from "./tool-descriptions";
import { voiceCatalogProduct, voiceTableState } from "./tool-state";
import { showReference } from "./use-cases/references";

export function createCastTools(
  services: ApiServices,
  actor: Actor,
  signal: AbortSignal,
  trigger: VoiceTrigger = "user",
  currentSession?: TableRecord,
  displayContext?: DisplayCurrencyContext,
) {
  const guard = () => signal.throwIfAborted();
  const rates = displayContext?.rates;
  const selectedCurrency = displayContext?.currency ?? null;
  return {
    getCustomerSuggestions: castTool({
      id: "getCustomerSuggestions",
      description: voiceToolDescriptions.getCustomerSuggestions,
      inputSchema: customerSuggestionsSchema,
      execute: async (input) => {
        guard();
        return customerSuggestions(services, actor, input);
      },
    }),
    getCustomerContext: castTool({
      id: "getCustomerContext",
      description: voiceToolDescriptions.getCustomerContext,
      inputSchema: z.object({}).strict(),
      execute: async () => {
        guard();
        return customerRecommendationContext(services, actor);
      },
    }),
    ...(trigger === "user"
      ? {
          saveCustomerMemory: castTool({
            id: "saveCustomerMemory",
            description: voiceToolDescriptions.saveCustomerMemory,
            inputSchema: saveCustomerMemorySchema,
            execute: async (input) => {
              guard();
              return saveAutomaticCustomerMemory(services, actor, input);
            },
          }),
        }
      : {}),
    getServiceGuidance: castTool({
      id: "getServiceGuidance",
      description: voiceToolDescriptions.getServiceGuidance,
      inputSchema: z
        .object({
          query: z.string().max(100).optional(),
          guideId: z.string().optional(),
          offset: z.number().int().nonnegative().optional(),
          show: z.boolean().optional(),
        })
        .strict(),
      execute: async ({ show = true, ...input }) => {
        guard();
        const result = await getServiceGuidance(services, actor, input);
        if (show && trigger === "user")
          await showServiceGuidance(services, actor, {
            configVersion: result.configVersion,
            guideIds: result.guides.map((guide) => guide.id),
            productIds: result.products.map((product) => product.id),
          });
        return result;
      },
    }),
    getProductFoodInformation: castTool({
      id: "getProductFoodInformation",
      description: voiceToolDescriptions.getProductFoodInformation,
      inputSchema: foodQuerySchema,
      execute: async (input) => {
        guard();
        const { optionAllergens: _optionAllergens, ...result } = await getProductFoodInformation(
          services,
          actor,
          input,
        );
        return result;
      },
    }),
    getCatalog: castTool({
      id: "getCatalog",
      description: voiceToolDescriptions.getCatalog,
      inputSchema: z
        .object({
          query: z.string().max(100).optional(),
          productIds: z
            .array(productIdSchema)
            .min(1)
            .max(8)
            .optional()
            .describe(
              "検索結果から自分で照合した内部の商品ID。客には尋ねず案内しない。必須選択肢・追加料金を含む詳細を返す",
            ),
          offset: z.number().int().min(0).max(maxConfigurationProducts).optional(),
          limit: z.number().int().min(1).max(8).optional(),
          show: z.boolean().optional(),
          quoteCurrency: displayCurrencyCodeSchema
            .optional()
            .describe("表示設定を変えず、この照会だけ外貨の参考額を返す"),
          includePlans: z
            .boolean()
            .describe("プランの料金・時間・対象・注文制限を質問されたときだけtrue")
            .optional(),
        })
        .strict(),
      execute: async ({
        query,
        productIds,
        offset = 0,
        limit = 8,
        show = false,
        includePlans = false,
        quoteCurrency,
      }) => {
        guard();
        const session = currentSession ?? (await getSession(services, actor));
        const catalog = await getCatalog(services, actor.storeId, actor.demoId);
        const locale = session.locale;
        const currency = quoteCurrency ?? selectedCurrency;
        const search = productIds
          ? { productIds, detail: true, total: new Set(productIds).size, more: false }
          : menuSearchPage(catalog.configuration, { query, offset, limit });
        const ids = [...new Set(search.productIds)];
        const detail = Boolean(productIds) || search.detail;
        const byId = new Map(
          catalog.configuration.products.map((product) => [product.id, product]),
        );
        const matches = ids.flatMap((id) => {
          const product = byId.get(id);
          return product ? [product] : [];
        });
        ensure(!productIds || matches.length === ids.length, "PRODUCT_NOT_FOUND", 422);
        const products = matches;
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
          displayCurrency: currencyMetadata(currency, rates),
          total: search.total,
          more: search.more,
          ...(show
            ? { displayedProductIds: products.slice(0, 4).map((product) => product.id) }
            : {}),
          storeName: catalog.storeName,
          version: catalog.version,
          ...(includePlans
            ? {
                plans: catalog.configuration.plans.map((plan) => ({
                  ...plan,
                  text: resolveText(plan.text, locale),
                  ...approximateAmounts({ pricePerPerson: plan.pricePerPerson }, currency, rates),
                })),
              }
            : {}),
          categories: catalog.configuration.categories.map((category) => ({
            id: category.id,
            displayName: resolveText(category.text, locale).displayName,
          })),
          detail,
          products: products.map((product) =>
            voiceCatalogProduct(product, locale, currency, rates, detail),
          ),
        };
      },
    }),
    getTableState: castTool({
      id: "getTableState",
      description: voiceToolDescriptions.getTableState,
      inputSchema: z.object({ quoteCurrency: displayCurrencyCodeSchema.optional() }).strict(),
      execute: async ({ quoteCurrency }) => {
        guard();
        return voiceTableState(
          await getTableState(services, actor),
          quoteCurrency ?? selectedCurrency,
          rates,
        );
      },
    }),
    ...(trigger === "user"
      ? {
          showReference: castTool({
            id: "showReference",
            description: voiceToolDescriptions.showReference,
            inputSchema: z
              .object({ url: z.url().max(2048), title: z.string().max(200).optional() })
              .strict(),
            execute: async (input) => {
              guard();
              return showReference(services, actor, input, signal);
            },
          }),
          captureCamera: castTool({
            id: "captureCamera",
            description: voiceToolDescriptions.captureCamera,
            inputSchema: z.object({ question: z.string().min(1).max(300) }).strict(),
            execute: async ({ question }) => {
              guard();
              return { question, sessionAuthorized: true };
            },
          }),
          endConversation: castTool({
            id: "endConversation",
            description: voiceToolDescriptions.endConversation,
            inputSchema: z.object({}).strict(),
            execute: async () => {
              guard();
              await getSession(services, actor);
              return { ending: true };
            },
          }),
          getCameraState: castTool({
            id: "getCameraState",
            description: voiceToolDescriptions.getCameraState,
            inputSchema: z.object({}).strict(),
            execute: async () => {
              guard();
              // 端末の権限・映像状態は認可完了後にWebが付加する。
              return { sessionAuthorized: true };
            },
          }),
          setLanguage: castTool({
            id: "setLanguage",
            description: voiceToolDescriptions.setLanguage,
            inputSchema: z.object({ locale: localeSchema }).strict(),
            execute: async (input) => {
              guard();
              const state = await changeLocale(services, actor, input.locale);
              return { locale: state.locale, voiceState: state.voiceState };
            },
          }),
          setDisplayCurrency: castTool({
            id: "setDisplayCurrency",
            description: voiceToolDescriptions.setDisplayCurrency,
            inputSchema: z.object({ currency: displayCurrencyCodeSchema.nullable() }).strict(),
            execute: async ({ currency }) => {
              guard();
              ensure(displayContext, "DISPLAY_CONTEXT_REQUIRED", 422);
              return { displayCurrency: currencyMetadata(currency, rates) };
            },
          }),
          setSpeechSpeed: castTool({
            id: "setSpeechSpeed",
            description: voiceToolDescriptions.setSpeechSpeed,
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
          showMenuSearch: castTool({
            id: "showMenuSearch",
            description: voiceToolDescriptions.showMenuSearch,
            inputSchema: menuSearchInputSchema,
            execute: async (input) => {
              guard();
              const catalog = await getCatalog(services, actor.storeId, actor.demoId);
              const state = await setUiSection(
                services,
                actor,
                { section: "menu", search: input },
                "core",
                { catalog, session: currentSession },
              );
              ensure(catalog.version === state.configVersion, "TABLE_CONFLICT");
              const byId = new Map(
                catalog.configuration.products.map((product) => [product.id, product]),
              );
              return {
                version: state.configVersion,
                ...state.menuSearch,
                products: (state.menuSearch?.productIds ?? []).flatMap((id) => {
                  const product = byId.get(id);
                  return product
                    ? [voiceCatalogProduct(product, state.locale, selectedCurrency, rates, false)]
                    : [];
                }),
                displayCurrency: currencyMetadata(selectedCurrency, rates),
              };
            },
          }),
          setUiSection: castTool({
            id: "setUiSection",
            description: voiceToolDescriptions.setUiSection,
            inputSchema: uiSectionInputSchema,
            execute: async (input) => {
              guard();
              const state = await setUiSection(services, actor, input);
              return { uiSection: state.uiSection, selectedProductId: state.selectedProductId };
            },
          }),
          showProducts: castTool({
            id: "showProducts",
            description: voiceToolDescriptions.showProducts,
            inputSchema: showProductsSchema,
            execute: async (input) => {
              guard();
              return showProducts(services, actor, input);
            },
          }),
          updateCart: castTool({
            id: "updateCart",
            description: voiceToolDescriptions.updateCart,
            inputSchema: cartUpdateSchema,
            execute: async (input) => {
              guard();
              return voiceTableState(
                await updateCart(services, actor, input),
                selectedCurrency,
                rates,
              );
            },
          }),
          prepareConfirmation: castTool({
            id: "prepareConfirmation",
            description: voiceToolDescriptions.prepareConfirmation,
            inputSchema: z.object({ expectedVersion: z.number().int().nonnegative() }).strict(),
            execute: async (input) => {
              guard();
              const snapshot = await prepareConfirmation(services, actor, {
                ...input,
                channel: "voice",
              });
              return {
                displayCurrency: currencyMetadata(selectedCurrency, rates),
                ...approximateAmounts({ total: snapshot.total }, selectedCurrency, rates),
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
            description: voiceToolDescriptions.submitOrder,
            inputSchema: submitSchema,
            execute: async (input) => {
              guard();
              ensure(input.approved, "APPROVAL_REQUIRED", 422);
              const order = await submitOrder(services, actor, input);
              return {
                orderId: order.id,
                status: order.status,
                total: order.total,
                displayCurrency: currencyMetadata(selectedCurrency, rates),
                ...approximateAmounts({ total: order.total }, selectedCurrency, rates),
              };
            },
          }),
          callStaff: castTool({
            id: "callStaff",
            description: voiceToolDescriptions.callStaff,
            inputSchema: staffCallInputSchema,
            execute: async (input) => {
              guard();
              const state = await callStaff(services, actor, "core", input);
              return {
                staffCalled: state.staffCalled,
                callId: state.staffCall?.id,
                status: state.staffCall?.status,
              };
            },
          }),
        }
      : {}),
  };
}
