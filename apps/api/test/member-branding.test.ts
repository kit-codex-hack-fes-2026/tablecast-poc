import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { stores } from "../src/db/table-schema";
import {
  createDraft,
  updateDraft,
  validateDraft,
} from "../src/modules/configuration/use-cases/drafts";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { saveMenuImage } from "../src/modules/media/service";
import { createApiServices } from "../src/platform/context";
import { byteStream } from "../src/platform/streams";
import { fixtureDb } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";

const origin = "http://localhost:3000";
const base = "/api/member-stores/tablecast-store";
const png = Uint8Array.fromBase64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
);
const imageMetadata = {
  imageKind: "illustration" as const,
  imageSource: { generated: false, description: "店舗会員カードの意匠" },
};
const request = (path: string) =>
  exports.default.fetch(new Request(origin + path, { redirect: "manual" }));

it("店舗別manifestは未ログインでも取得でき、会員情報や接客設定を含まず店舗名の変更でも識別子を保つ", async () => {
  await setupFixture();
  const response = await request(`${base}/manifest.webmanifest`);
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/manifest+json");
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
  const identity = await request(`${base}/identity`);
  expect(identity.status).toBe(200);
  expect(identity.headers.get("Cache-Control")).toBe("public, max-age=300");
  expect(await identity.json()).toEqual({
    storeId: "tablecast-store",
    storeName: "卓上喫茶",
    logo: null,
  });
  const manifest = await response.json<Record<string, unknown>>();
  expect(manifest).toMatchObject({
    id: "/member/tablecast-store",
    name: "卓上喫茶",
    start_url: "/member/tablecast-store",
    scope: "/member/",
  });
  expect(Object.keys(manifest).toSorted()).toEqual([
    "background_color",
    "display",
    "icons",
    "id",
    "name",
    "scope",
    "short_name",
    "start_url",
    "theme_color",
  ]);
  await fixtureDb
    .update(stores)
    .set({ name: "新しい店舗名" })
    .where(eq(stores.id, "tablecast-store"));
  expect(await (await request(`${base}/manifest.webmanifest`)).json()).toMatchObject({
    id: manifest.id,
    name: "新しい店舗名",
    start_url: manifest.start_url,
  });
  const icon = await request(`${base}/icon?width=180`);
  expect(icon.status).toBe(302);
  expect(icon.headers.get("Location")).toBe("/icons/tablecast-180.png");
  expect((await request("/api/member-stores/missing/manifest.webmanifest")).status).toBe(404);
});

it("カード意匠は画像出所を検査し、公開前や公開意匠と無関係な画像を公開配信しない", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const uploaded = await saveMenuImage(
    services,
    staff,
    new File([png], "card.png", { type: "image/png" }),
    imageMetadata,
  );
  const image = {
    imageKey: uploaded.imageKey,
    ...imageMetadata,
    alt: { ja: "店舗のカード", en: "Venue card" },
  };
  const bannerImage = await env.TABLECAST_IMAGES.input(byteStream(new Blob([png]).stream()))
    .transform({ width: 128, height: 32, fit: "cover" })
    .output({ format: "image/png" });
  const bannerUpload = await saveMenuImage(
    services,
    staff,
    new File([await bannerImage.response().arrayBuffer()], "banner.png", { type: "image/png" }),
    imageMetadata,
  );
  const banner = {
    imageKey: bannerUpload.imageKey,
    ...imageMetadata,
    alt: { ja: "店舗の横長ロゴ", en: "Venue banner" },
  };
  const draft = await createDraft(services, staff);
  const branding = {
    logo: image,
    banner,
    membershipCard: { image, tone: "green" as const, imageFit: "contain" as const },
  };
  const imagePath = `${base}/images/${image.imageKey}`;
  const bannerPath = `${base}/images/${banner.imageKey}`;
  const next = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration: { ...configuration, branding },
  });
  expect((await request(imagePath)).status).toBe(404);
  expect((await request(bannerPath)).status).toBe(404);
  await expect(
    updateDraft(services, staff, draft.id, {
      expectedVersion: next.version,
      configuration: {
        ...configuration,
        branding: {
          ...branding,
          membershipCard: {
            ...branding.membershipCard,
            image: { ...image, imageSource: { generated: true, description: "別の出所" } },
          },
        },
      },
    }),
  ).rejects.toMatchObject({ code: "IMAGE_METADATA_MISMATCH" });
  const ready = await validateDraft(services, staff, draft.id, next.version);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    idempotencyKey: crypto.randomUUID(),
    approved: true,
  });
  const publicImage = await request(imagePath);
  expect(publicImage.status).toBe(200);
  expect(publicImage.headers.get("Content-Type")).toBe("image/webp");
  expect(publicImage.headers.get("Cache-Control")).toBe("public, max-age=300");
  expect((await publicImage.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect(await (await request(`${base}/identity`)).json()).toEqual({
    storeId: staff.storeId,
    storeName: "卓上喫茶",
    logo: banner,
  });
  const deliveredBanner = await request(bannerPath);
  expect(deliveredBanner.status).toBe(200);
  expect(
    await env.TABLECAST_IMAGES.info(
      byteStream(new Blob([await deliveredBanner.arrayBuffer()]).stream()),
    ),
  ).toMatchObject({ width: 128, height: 32 });
  expect((await request(`${base}/images/tablecast/uploads/${"b".repeat(64)}.webp`)).status).toBe(
    404,
  );
  await fixtureDb.insert(stores).values({
    id: "tablecast-other-store",
    organization_id: "tablecast-fixture-other-org",
    name: "別の店舗",
    config_json: JSON.stringify(configuration),
    updated_at: Date.now(),
  });
  expect(
    (await request(`/api/member-stores/tablecast-other-store/images/${image.imageKey}`)).status,
  ).toBe(404);
  const enrolled = await exports.default.fetch(
    new Request(`${origin}/api/customer/stores/tablecast-store/enrol`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ consentVersion: 1 }),
    }),
  );
  expect(enrolled.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await enrolled.json()).toMatchObject({ memberName: "店員", store: { branding } });
});

it("PWAアイコンは小さな画像を拒否し、公開済みの正方形アイコンをiOS用PNGでも配信する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const small = await saveMenuImage(
    services,
    staff,
    new File([png], "small.png", { type: "image/png" }),
    imageMetadata,
  );
  const draft = await createDraft(services, staff);
  const smallIcon = {
    imageKey: small.imageKey,
    ...imageMetadata,
    alt: { ja: "アイコン", en: "Icon" },
  };
  await expect(
    updateDraft(services, staff, draft.id, {
      expectedVersion: draft.version,
      configuration: { ...configuration, branding: { logo: null, memberIcon: smallIcon } },
    }),
  ).rejects.toMatchObject({ code: "MEMBER_ICON_SIZE" });
  const square = await env.TABLECAST_IMAGES.input(byteStream(new Blob([png]).stream()))
    .transform({ width: 512, height: 512, fit: "cover" })
    .output({ format: "image/png" });
  const uploaded = await saveMenuImage(
    services,
    staff,
    new File([await square.response().arrayBuffer()], "icon.png", { type: "image/png" }),
    imageMetadata,
  );
  const icon = { ...smallIcon, imageKey: uploaded.imageKey };
  const next = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration: { ...configuration, branding: { logo: null, memberIcon: icon } },
  });
  const ready = await validateDraft(services, staff, draft.id, next.version);
  await publishDraft(services, staff, draft.id, {
    expectedVersion: ready.version,
    baseVersion: ready.baseVersion,
    idempotencyKey: crypto.randomUUID(),
    approved: true,
  });
  expect(await (await request(`${base}/manifest.webmanifest`)).json()).toMatchObject({
    icons: [
      { sizes: "192x192", src: `${base}/images/${icon.imageKey}?width=192` },
      { sizes: "512x512", src: `${base}/images/${icon.imageKey}?width=512` },
    ],
  });
  const appleIcon = await request(`${base}/icon?width=180`);
  expect(appleIcon.status).toBe(200);
  expect(appleIcon.headers.get("Content-Type")).toBe("image/png");
  expect(appleIcon.headers.get("ETag")).toContain("180-png");
  const iconBytes = await appleIcon.arrayBuffer();
  expect(iconBytes.byteLength).toBeGreaterThan(0);
  expect(await env.TABLECAST_IMAGES.info(byteStream(new Blob([iconBytes]).stream()))).toMatchObject(
    {
      width: 180,
      height: 180,
    },
  );
});
