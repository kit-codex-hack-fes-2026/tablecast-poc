import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./support/test";
import {
  catalogSchema,
  configDraftSchema,
  uploadedImageSchema,
  type ThemeImage,
} from "@tablecast/api/schema";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };

test("生成した背景・透過ロゴ・チラシを実注文画面へ配置して商品を開く", async ({
  page,
  baseURL,
}, testInfo) => {
  const headers = { Origin: baseURL ?? "" };
  expect(
    (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).ok(),
  ).toBe(true);
  const storeId = "tablecast-hanul";
  const endpoint = `/api/admin/stores/${storeId}`;
  const original = catalogSchema.parse(
    await (await page.request.get(`${endpoint}/catalog`)).json(),
  );
  const images: Record<string, ThemeImage> = {};
  for (const name of ["background", "logo", "banner"]) {
    const buffer = await readFile(
      new URL(`../../../docs/design/themes/gomen/${name}.png`, import.meta.url),
    );
    const upload = await page.request.post(`${endpoint}/images`, {
      headers,
      multipart: {
        image: { name: `${name}.png`, mimeType: "image/png", buffer },
        metadata: JSON.stringify({
          imageKind: "illustration",
          imageSource: {
            generated: true,
            description:
              "画像生成による架空ラーメン店の表示検証用素材。公式ロゴ・実料理写真ではありません。",
          },
        }),
      },
    });
    expect(upload.ok()).toBe(true);
    const { url: _url, ...reference } = uploadedImageSchema.parse(await upload.json());
    images[name] = { ...reference, alt: { ja: `作例 ${name}`, en: `Example ${name}` } };
  }
  const logo = images.logo,
    background = images.background,
    banner = images.banner;
  const baseProduct = original.configuration.products[0];
  if (!logo || !background || !banner || !baseProduct) throw new Error("素材と商品が必要です");
  // 本番メニューを変えず、隔離した下書き内だけに架空店の表示用商品を置く。
  const product = {
    ...baseProduct,
    id: "tablecast-example-ramen",
    price: 980,
    available: true,
    modifiers: [],
    imageKey: banner.imageKey,
    imageKind: banner.imageKind,
    imageSource: banner.imageSource,
    text: {
      ja: {
        ...baseProduct.text.ja,
        displayName: "剛麺ラーメン",
        speechName: "ごうめんらーめん",
        description: "表示検証用の架空商品です。",
        aliases: [],
      },
      en: {
        ...baseProduct.text.en,
        displayName: "Gomen ramen",
        speechName: "Gomen ramen",
        description: "Fictional item for interface testing.",
        aliases: [],
      },
    },
    allergens: {
      contains: [],
      evidence: "unknown",
      crossContact: "unknown",
      vegan: "unknown",
      note: { ja: "表示検証用", en: "Interface example" },
    },
  };
  const draft = configDraftSchema.parse(
    await (await page.request.post(`${endpoint}/drafts`, { headers, data: {} })).json(),
  );
  const prepared = await page.request.put(`${endpoint}/drafts/${draft.id}`, {
    headers,
    data: {
      expectedVersion: draft.version,
      instructionFormatVersion: 1,
      configuration: {
        ...draft.configuration,
        storeName: "一乗寺 剛麺研究所",
        products: [product],
        categories: [{ ...draft.configuration.categories[0], id: product.categoryId }],
        plans: [],
        branding: { logo },
        appearance: {
          colours: { ink: "#201a16", paper: "#fff8e7", accent: "#bb241c" },
          fonts: { heading: "serif", body: "sans" },
          assets: { paper: background },
          composition: {
            masthead: {
              visible: true,
              align: "center",
              logoWidth: 280,
              logoHeight: 96,
              padding: 8,
            },
            banners: { columns: 2, gap: 16 },
          },
          parts: {
            screen: { image: { asset: "paper", fit: "cover", x: 50, y: 50, opacity: 1 } },
            conversation: { background: "transparent" },
            menu: { background: "transparent" },
            "menu-masthead": { background: "transparent" },
            banner: { radius: 6, borderColor: "#201a16", borderWidth: 2, shadow: "offset" },
            "product-card": {
              background: "#fff8e7",
              radius: 4,
              borderColor: "#201a16",
              borderWidth: 2,
            },
          },
        },
        banners: [
          {
            id: "ramen-flyer",
            image: banner,
            enabled: true,
            span: "full",
            hotspots: [
              { id: "ramen", productId: product.id, rect: { x: 0, y: 0, width: 1, height: 1 } },
            ],
          },
        ],
      },
    },
  });
  expect(prepared.ok()).toBe(true);
  await page.goto(`/admin/stores/${storeId}/design?draftId=${draft.id}`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByLabel(ja.theme_logo_width, { exact: true }).fill("300");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.getByRole("button", { name: ja.theme_preview }).click();
  const kiosk = page.frameLocator("iframe");
  const masthead = kiosk.locator('[data-theme-part="menu-masthead"]');
  await expect(masthead.getByRole("img")).toHaveCSS("width", "300px");
  await expect(kiosk.getByRole("button", { name: ja.kiosk_call_staff })).toBeVisible();
  await expect(kiosk.getByRole("button", { name: ja.kiosk_voice_resume })).toBeVisible();
  for (const image of [
    masthead.getByRole("img"),
    kiosk.getByRole("img", { name: banner.alt.ja }),
  ]) {
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await expect(kiosk.locator('[data-theme-part="screen"]')).toHaveCSS("background-image", /url/);
  await kiosk.locator('[data-theme-part="screen"]').evaluate(async (element) => {
    const source = /url\("([^"]+)"\)/.exec(getComputedStyle(element).backgroundImage)?.[1];
    if (!source) throw new Error("背景画像が必要です");
    const picture = new Image();
    picture.src = source;
    await picture.decode();
  });
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-art-landscape.png"),
    fullPage: true,
  });
  await kiosk
    .getByRole("button", { name: product.text.ja.displayName, exact: true })
    .first()
    .click();
  await expect(
    kiosk.getByRole("heading", { name: product.text.ja.displayName, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-art-product.png"),
    fullPage: true,
  });
  await kiosk.getByRole("button", { name: ja.kiosk_menu, exact: true }).click();
  await page.getByRole("button", { name: ja.demo_rotate, exact: true }).click();
  await kiosk.getByRole("button", { name: "English", exact: true }).click();
  await expect(kiosk.getByRole("img", { name: banner.alt.en })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-art-portrait.png"),
    fullPage: true,
  });
  expect(
    catalogSchema.parse(await (await page.request.get(`${endpoint}/catalog`)).json()).configuration,
  ).toEqual(original.configuration);
});
