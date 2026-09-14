import { configurationSchema, type ConfigDraft, type Configuration } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { sessionOptions } from "../../lib/session-query";
import { MenuItem } from "./menu-item";
import { draftOptions } from "./menu-query";
import { StoreShell } from "./store-shell";
import { storesOptions } from "./store-query";
import "../../styles.css";

const storeId = "tablecast-story";
const draftId = "tablecast-image-draft";
const png = new File(
  [
    Uint8Array.fromBase64(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
    ),
  ],
  "tablecast-photo.png",
  { type: "image/png" },
);
let client: QueryClient;
let restoreHistory: (() => void) | undefined;
afterEach(async () => {
  await cleanup();
  restoreHistory?.();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountForm(locale: "ja" | "en" = "ja") {
  const initial: ConfigDraft = {
    id: draftId,
    storeId,
    version: 1,
    baseVersion: 1,
    status: "draft",
    configuration: structuredClone(catalog.configuration),
    errors: [],
    changes: [],
    createdAt: 1,
    updatedAt: 1,
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(draftOptions(storeId, draftId).queryKey, initial);
  client.setQueryData(storesOptions.queryKey, {
    locale,
    stores: [
      {
        id: storeId,
        name: "画像検証店舗",
        logo: null,
        organizationId: "tablecast-images-org",
        role: "owner",
      },
    ],
  });
  client.setQueryData(sessionOptions.queryKey, null);
  const root = createRootRoute();
  const storeRoute = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const edit = createRoute({
    getParentRoute: () => storeRoute,
    path: "menu/changes/$draftId/products/$itemId",
    component: () => <MenuItem section="products" itemId={product.id} draftId={draftId} />,
  });
  const list = createRoute({
    getParentRoute: () => storeRoute,
    path: "menu/changes/$draftId/products",
    component: () => <h1>商品一覧へ移動済み</h1>,
  });
  const previousUrl = window.location.href;
  const previousState: unknown = window.history.state;
  window.history.replaceState(
    null,
    "",
    `/admin/stores/${storeId}/menu/changes/${draftId}/products/${product.id}`,
  );
  const history = createBrowserHistory();
  restoreHistory = () => {
    history.destroy();
    window.history.replaceState(previousState, "", previousUrl);
  };
  const router = createRouter({
    routeTree: root.addChildren([storeRoute.addChildren([edit, list])]),
    history,
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return initial;
}

it("画像取込中の保存を止め、取込後の画像を含めて保存し古いsnapshotで上書きしない", async () => {
  // Given: 取込と保存の応答を別々に止められる実MenuItemフォーム
  const imageResponse = Promise.withResolvers<Response>();
  const saveResponse = Promise.withResolvers<Response>();
  const saved: Configuration[] = [];
  let uploaded = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization" || path === "/api/auth/get-session")
      return Response.json(null);
    if (path === `/api/admin/stores/${storeId}/images` && request.method === "POST") {
      uploaded = true;
      return imageResponse.promise;
    }
    if (path === `/api/admin/stores/${storeId}/drafts/${draftId}` && request.method === "PUT") {
      const body: { configuration: unknown } = await request.json();
      saved.push(configurationSchema.parse(body.configuration));
      return saveResponse.promise;
    }
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
  const initial = await mountForm();
  try {
    const form = page.getByRole("main");
    await form.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true }).fill("700");
    const image = form.getByRole("region", { name: ja.editor_images, exact: true });
    await image.getByLabelText(ja.editor_image_choose).upload(png);
    await image
      .getByRole("textbox", { name: ja.editor_image_source, exact: true })
      .fill("店舗写真");
    await image.getByRole("button", { name: ja.editor_image_upload }).click();
    await expect.poll(() => uploaded).toBe(true);
    const save = form.getByRole("button", { name: ja.common_save, exact: true });
    // Then: ボタンとnative submitの両方で古い参照の保存を止める
    await expect.element(save).toBeDisabled();
    await expect.element(form.getByText(ja.editor_image_wait, { exact: true })).toBeVisible();
    await page.viewport(768, 1024);
    await page.screenshot({ path: "../../../test-results/browser/tablecast-image-pending-ja.png" });
    save.element().closest("form")?.requestSubmit();
    await form.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true }).fill("710");
    expect(saved).toEqual([]);
    imageResponse.resolve(
      Response.json({
        imageKey: "tablecast/uploads/new-photo.webp",
        imageKind: "photograph",
        imageSource: { generated: false, description: "店舗写真" },
        url: "/media/tablecast/uploads/new-photo.webp",
      }),
    );
    await expect.element(save).toBeEnabled();
    await save.click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].products[0]).toMatchObject({
      price: 710,
      imageKey: "tablecast/uploads/new-photo.webp",
    });
    await expect.element(image.getByLabelText(ja.editor_image_replace)).toBeDisabled();
    saveResponse.resolve(Response.json({ ...initial, version: 2, configuration: saved[0] }));
    await expect
      .element(form.getByRole("status").filter({ hasText: ja.account_saved }))
      .toBeVisible();
    await expect.element(image.getByText(ja.editor_photograph, { exact: true })).toBeVisible();
    await expect.element(form.getByText(ja.admin_unsaved, { exact: true })).not.toBeInTheDocument();
  } finally {
    imageResponse.resolve(
      Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 }),
    );
    saveResponse.resolve(Response.json(initial));
  }
});

it("未変更フォームでも画像の選択候補と取込失敗後の入力を離脱確認で保護し、入力を戻すと解除する", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization" || path === "/api/auth/get-session")
      return Response.json(null);
    if (path === `/api/admin/stores/${storeId}/images` && request.method === "POST")
      return Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 });
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
  await mountForm();
  const form = page.getByRole("main");
  const image = form.getByRole("region", { name: ja.editor_images, exact: true });
  const save = form.getByRole("button", { name: ja.common_save, exact: true });
  const back = form.getByRole("link", { name: ja.editor_products, exact: true });
  await image.getByLabelText(ja.editor_image_choose).upload(png);
  await expect.element(save).toHaveAttribute("data-pwa-blocked", "true");
  await expect.element(form.getByText(ja.editor_image_staged, { exact: true })).toBeVisible();
  const beforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(beforeUnload);
  expect(beforeUnload.defaultPrevented).toBe(true);
  await back.click();
  expect(confirm).toHaveBeenCalledTimes(1);
  await expect
    .element(form.getByRole("heading", { name: product.text.ja.displayName }))
    .toBeVisible();
  await image.getByRole("textbox", { name: ja.editor_image_source, exact: true }).fill("店舗写真");
  await image.getByRole("button", { name: ja.editor_image_upload }).click();
  await expect.element(image.getByRole("button", { name: ja.common_retry })).toBeVisible();
  await expect.element(save).toHaveAttribute("data-pwa-blocked", "true");
  await back.click();
  expect(confirm).toHaveBeenCalledTimes(2);
  await expect.element(image.getByRole("img", { name: ja.editor_image_candidate })).toBeVisible();
  await page.viewport(1024, 768);
  image
    .getByRole("button", { name: ja.editor_image_reset })
    .element()
    .scrollIntoView({ block: "center" });
  await page.screenshot({
    path: "../../../test-results/browser/tablecast-image-staged-reset-ja.png",
  });
  await image.getByRole("button", { name: ja.editor_image_reset, exact: true }).click();
  await expect.element(save).toHaveAttribute("data-pwa-blocked", "false");
  const clearedBeforeUnload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clearedBeforeUnload);
  expect(clearedBeforeUnload.defaultPrevented).toBe(false);
  await back.click();
  await expect.element(page.getByRole("heading", { name: "商品一覧へ移動済み" })).toBeVisible();
  expect(confirm).toHaveBeenCalledTimes(2);
});

it("複数選択肢の取込中は削除・離脱・PWA更新を止め、再試行との同時完了でも全結果を保存する", async () => {
  const responses = [
    Promise.withResolvers<Response>(),
    Promise.withResolvers<Response>(),
    Promise.withResolvers<Response>(),
  ];
  const saved: Configuration[] = [];
  let uploads = 0;
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization" || path === "/api/auth/get-session")
      return Response.json(null);
    if (path === `/api/admin/stores/${storeId}/images` && request.method === "POST")
      return responses[uploads++].promise;
    if (path === `/api/admin/stores/${storeId}/drafts/${draftId}` && request.method === "PUT") {
      const body: { configuration: unknown } = await request.json();
      const configuration = configurationSchema.parse(body.configuration);
      saved.push(configuration);
      return Response.json({ ...initial, version: 2, configuration });
    }
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
  const initial = await mountForm("en");
  try {
    const form = page.getByRole("main");
    const first = form.getByRole("group", {
      name: "Group 1: Serving size Option 1: 60 mL",
      exact: true,
    });
    const second = form.getByRole("group", {
      name: "Group 1: Serving size Option 2: 90 mL",
      exact: true,
    });
    for (const option of [first, second]) {
      await option.getByText(en.editor_option_details, { exact: true }).click();
      await option.getByLabelText(en.editor_image_choose).upload(png);
      await option
        .getByRole("textbox", { name: en.editor_image_source, exact: true })
        .fill("Store photograph");
      await option.getByRole("button", { name: en.editor_image_upload }).click();
    }
    await expect.poll(() => uploads).toBe(2);
    const save = form.getByRole("button", { name: en.common_save, exact: true });
    const remove = form.getByRole("button", { name: en.menu_remove_item, exact: true });
    const removeOption = first.getByRole("button", {
      name: `${en.editor_remove_option} Group 1: Serving size Option 1: 60 mL`,
      exact: true,
    });
    const removeGroup = form.getByRole("button", {
      name: `${en.editor_remove_modifier} Group 1: Serving size`,
      exact: true,
    });
    const back = form.getByRole("link", { name: en.editor_products, exact: true });
    await expect.element(save).toBeDisabled();
    await expect.element(save).toHaveAttribute("data-pwa-blocked", "true");
    await expect.element(remove).toBeDisabled();
    await expect.element(removeOption).toBeDisabled();
    await expect.element(removeGroup).toBeDisabled();
    await expect.element(form.getByText(en.editor_image_wait, { exact: true })).toBeVisible();
    await page.viewport(1024, 768);
    await page.screenshot({ path: "../../../test-results/browser/tablecast-image-pending-en.png" });
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    await back.click();
    await expect
      .element(form.getByRole("heading", { name: product.text.en.displayName }))
      .toBeVisible();
    expect(confirm).not.toHaveBeenCalled();

    // 一方の失敗後も他方の完了を待ち、再試行を並行して開始できる。
    responses[0].resolve(
      Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 }),
    );
    await expect.element(first.getByRole("button", { name: en.common_retry })).toBeVisible();
    await expect.element(save).toBeDisabled();
    await expect.element(remove).toBeDisabled();
    await expect.element(removeOption).toBeDisabled();
    await expect.element(removeGroup).toBeDisabled();
    await first.getByRole("button", { name: en.common_retry }).click();
    await expect.poll(() => uploads).toBe(3);
    responses[1].resolve(
      Response.json({
        imageKey: "tablecast/uploads/large-glass.webp",
        imageKind: "photograph",
        imageSource: { generated: false, description: "Store photograph" },
        url: "/media/tablecast/uploads/large-glass.webp",
      }),
    );
    responses[2].resolve(
      Response.json({
        imageKey: "tablecast/uploads/glass.webp",
        imageKind: "photograph",
        imageSource: { generated: false, description: "Store photograph" },
        url: "/media/tablecast/uploads/glass.webp",
      }),
    );
    await expect.element(save).toBeEnabled();
    await save.click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0].products[0].modifiers[0].options).toMatchObject([
      { imageKey: "tablecast/uploads/glass.webp", imageKind: "photograph" },
      { imageKey: "tablecast/uploads/large-glass.webp", imageKind: "photograph" },
    ]);
    await expect.element(save).toHaveAttribute("data-pwa-blocked", "false");
    const savedBeforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedBeforeUnload);
    expect(savedBeforeUnload.defaultPrevented).toBe(false);
    await expect.element(removeOption).toBeEnabled();
    await expect.element(removeGroup).toBeEnabled();
    await removeOption.click();
    await expect.element(first).not.toBeInTheDocument();
    await removeGroup.click();
    await expect
      .element(form.getByRole("group", { name: "Group 1: Serving size", exact: true }))
      .not.toBeInTheDocument();
    await back.click();
    await expect.element(page.getByRole("heading", { name: "商品一覧へ移動済み" })).toBeVisible();
  } finally {
    for (const response of responses)
      response.resolve(
        Response.json({ error: { code: "IMAGE_PROCESSING_FAILED" } }, { status: 503 }),
      );
  }
});
