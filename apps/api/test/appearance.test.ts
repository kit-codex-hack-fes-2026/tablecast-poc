import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { z } from "zod";
import {
  appearanceSchema,
  bannerSchema,
  configurationSchema,
  type ThemeImage,
} from "../src/schema";
import { configurationErrors } from "../src/modules/catalog/pricing";
import {
  createDraft,
  updateDraft,
  validateDraft,
  publishDraft,
} from "../src/modules/configuration/service";
import { getCatalog } from "../src/modules/catalog/queries";
import { createApiServices } from "../src/platform/context";
import { configuration, setupFixture } from "./fixture";

const image: ThemeImage = {
  imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
  imageKind: "illustration",
  imageSource: { generated: true, description: "架空店のチラシ" },
  alt: { ja: "チラシ", en: "Flyer" },
};
it.each([
  "body { color: #000000 }",
  '[data-theme-part="header"] { display:none }',
  '[data-theme-part="voice-controls"] { padding:32px }',
  '[data-theme-part="product-card"] { position:fixed }',
  '[data-theme-part="product-card"] { background-image:url(https://example.org/x) }',
  '[data-theme-part="header"] { color:#000000!important }',
  '@import "https://example.org/x";',
  '[data-theme-part="menu"] * { color:#000000 }',
  '[data-theme-part="menu"] { & button { color:#000000 } }',
  '[data-theme-part="menu"] { background-image:var(--tablecast-image-missing) }',
  '[data-theme-part="menu"] { --x: url(https://example.org/x); color:var(--x) }',
  '[data-theme-part="menu"] { color: transparent }',
  '[data-theme-part="menu"] { font-size:0px }',
])("機能を隠すCSSや外部参照を拒否する: %s", (customCss) => {
  expect(appearanceSchema.safeParse({ customCss }).success).toBe(false);
});
it("登録画像と公開部品の装飾を許可しMCP用JSON Schemaへ変換できる", () => {
  expect(
    appearanceSchema.safeParse({
      assets: { paper: image },
      customCss:
        '[data-theme-part="product-card"] { border-width:3px; border-color:#201a16; background-image:var(--tablecast-image-paper); padding:12px }',
    }).success,
  ).toBe(true);
  expect(z.toJSONSchema(configurationSchema).properties).toHaveProperty("appearance");
  expect(configurationSchema.parse(configuration)).toEqual(configuration);
});
it("画像外の領域と存在しない商品を検出する", () => {
  const banner = {
    id: "flyer",
    enabled: true,
    image,
    hotspots: [{ id: "first", productId: "missing", rect: { x: 0, y: 0, width: 1, height: 1 } }],
  };
  expect(configurationErrors({ ...configuration, banners: [banner] })).toContainEqual({
    code: "PRODUCT_NOT_FOUND",
    path: ["banners", 0, "hotspots", 0, "productId"],
    params: { productId: "missing" },
  });
  expect(
    bannerSchema.safeParse({
      ...banner,
      hotspots: [{ ...banner.hotspots[0], rect: { x: 0.9, y: 0, width: 0.5, height: 1 } }],
    }).success,
  ).toBe(false);
});
it("画像の配置が操作領域を押し潰す寸法や無制限の列数を拒否する", () => {
  expect(
    appearanceSchema.safeParse({ composition: { banners: { columns: 10, gap: -2 } } }).success,
  ).toBe(false);
  expect(
    appearanceSchema.safeParse({
      composition: {
        masthead: { visible: true, align: "center", logoWidth: 2000, logoHeight: 0, padding: -10 },
      },
    }).success,
  ).toBe(false);
  expect(
    appearanceSchema.safeParse({
      assets: { paper: image },
      parts: {
        menu: { image: { asset: "paper", fit: "repeat", x: 50, y: 50, opacity: 1, tileSize: 0 } },
      },
    }).success,
  ).toBe(false);
});
it("店舗ロゴ・装飾・チラシの他店舗画像を拒否し公開まで客側へ反映しない", async () => {
  const firstProduct = configuration.products[0];
  if (!firstProduct) throw new Error("PRODUCT_REQUIRED");
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const draft = await createDraft(services, staff);
  const metadata = { imageKind: image.imageKind, imageSource: image.imageSource };
  await env.TABLECAST_MEDIA.put(image.imageKey, "image", {
    customMetadata: { storeId: "another-store", metadata: JSON.stringify(metadata) },
  });
  const banner = {
    id: "flyer",
    enabled: true,
    image,
    hotspots: [
      {
        id: "first",
        productId: firstProduct.id,
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
    ],
  };
  for (const change of [
    { branding: { logo: image } },
    { appearance: { assets: { paper: image } } },
    { banners: [banner] },
  ]) {
    await expect(
      updateDraft(services, staff, draft.id, {
        expectedVersion: draft.version,
        configuration: { ...configuration, ...change },
      }),
    ).rejects.toMatchObject({ code: "IMAGE_FORBIDDEN" });
  }
  await env.TABLECAST_MEDIA.put(image.imageKey, "image", {
    customMetadata: { storeId: staff.storeId, metadata: JSON.stringify(metadata) },
  });
  const next = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration: {
      ...configuration,
      branding: { logo: image },
      appearance: { assets: { paper: image } },
      banners: [banner],
    },
  });
  expect((await getCatalog(services, staff.storeId)).configuration.branding).toBeUndefined();
  const ready = await validateDraft(services, staff, draft.id, next.version);
  expect(ready.status).toBe("ready");
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    idempotencyKey: crypto.randomUUID(),
    approved: true,
  });
  expect((await getCatalog(services, staff.storeId)).configuration.branding?.logo).toEqual(image);
  for (const logo of [{ ...image, imageKey: `tablecast/uploads/${"b".repeat(64)}.webp` }, null]) {
    if (logo)
      await env.TABLECAST_MEDIA.put(logo.imageKey, "replacement", {
        customMetadata: { storeId: staff.storeId, metadata: JSON.stringify(metadata) },
      });
    const edit = await createDraft(services, staff);
    const saved = await updateDraft(services, staff, edit.id, {
      expectedVersion: edit.version,
      configuration: { ...edit.configuration, branding: { logo } },
    });
    const validated = await validateDraft(services, staff, edit.id, saved.version);
    await publishDraft(services, staff, edit.id, {
      expectedVersion: validated.version,
      baseVersion: validated.baseVersion,
      idempotencyKey: crypto.randomUUID(),
      approved: true,
    });
    const published = (await getCatalog(services, staff.storeId)).configuration;
    expect(published.branding?.logo).toEqual(logo);
    expect(published.appearance).toEqual(next.configuration.appearance);
    expect(published.products).toEqual(configuration.products);
  }
});
