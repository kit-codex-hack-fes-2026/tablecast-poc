import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import {
  createDraft,
  updateDraft,
  validateDraft,
  publishDraft,
} from "../src/modules/configuration/service";
import { saveMenuImage, uploadImage } from "../src/modules/media/service";
import { maxImageBytes } from "../src/modules/media/model";
import { createApiServices } from "../src/platform/context";
import { uploadedImageSchema } from "../src/schema";
import { setupFixture } from "./fixture";

const data =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const png = () =>
  new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], "tablecast.png", {
    type: "image/png",
  });
const metadata = {
  imageKind: "illustration" as const,
  imageSource: { generated: true, description: "店舗が利用を許可した生成商品イメージ" },
};
const input = { data, mimeType: "image/png" as const, ...metadata };
afterEach(() => vi.restoreAllMocks());

it("ChatGPTの画像取得は信頼するHTTPS配信先だけを許可し、転送先も検証する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const provider = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }),
    );
  for (const download_url of [
    "http://files.oaiusercontent.com/image",
    "https://127.0.0.1/image",
    "https://files.oaiusercontent.com.evil.test/image",
    "https://files.oaiusercontent.com:444/image",
    "https://user:secret@files.oaiusercontent.com/image",
  ]) {
    await expect(
      uploadImage(services, staff, { ...metadata, file: { download_url, file_id: "file-test" } }),
    ).rejects.toMatchObject({ code: "IMAGE_URL_FORBIDDEN" });
  }
  expect(provider).not.toHaveBeenCalled();
  await expect(
    uploadImage(services, staff, {
      ...metadata,
      file: { download_url: "https://files.oaiusercontent.com/image", file_id: "file-test" },
    }),
  ).rejects.toMatchObject({ code: "IMAGE_URL_FORBIDDEN" });
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    0,
  );
});

it("期限切れ・取得失敗・容量超過では署名を返さず、画像や下書きを変更しない", async () => {
  const { staff } = await setupFixture();
  const file = {
    download_url: "https://files.oaiusercontent.com/image?sig=tablecast-private-signature",
    file_id: "file-test",
  };
  const provider = vi.spyOn(globalThis, "fetch");
  for (const response of [
    new Response("expired", { status: 403 }),
    new Response("large", { headers: { "Content-Length": String(maxImageBytes + 1) } }),
    new Response(new Uint8Array(maxImageBytes + 1), { headers: { "Content-Type": "image/png" } }),
  ]) {
    provider.mockResolvedValueOnce(response);
    await expect(
      uploadImage(createApiServices(env), staff, { ...metadata, file }),
    ).rejects.toBeInstanceOf(Error);
  }
  provider.mockRejectedValueOnce(new Error(file.download_url));
  await expect(
    uploadImage(createApiServices(env), staff, { ...metadata, file }),
  ).rejects.toMatchObject({ code: "IMAGE_DOWNLOAD_FAILED", message: "IMAGE_DOWNLOAD_FAILED" });
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    0,
  );
});

it("ファイルとBase64の同時指定・入力なしを取得前に拒否する", async () => {
  const { staff } = await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch");
  await expect(uploadImage(createApiServices(env), staff, metadata)).rejects.toMatchObject({
    code: "IMAGE_INPUT_REQUIRED",
  });
  await expect(
    uploadImage(createApiServices(env), staff, {
      ...input,
      file: { download_url: "https://files.oaiusercontent.com/image", file_id: "file-test" },
    }),
  ).rejects.toMatchObject({ code: "IMAGE_INPUT_REQUIRED" });
  expect(provider).not.toHaveBeenCalled();
});

it("MCPと管理APIの画像取り込みが同じキーと出所へ収束する", async () => {
  const { staff, cookie } = await setupFixture();
  const services = createApiServices(env);
  const first = await uploadImage(services, staff, input);
  const asset = await env.TABLECAST_MEDIA.get(first.imageKey);
  expect(asset?.httpMetadata?.contentType).toBe("image/webp");
  expect(asset?.customMetadata).toEqual({
    storeId: staff.storeId,
    metadata: JSON.stringify(metadata),
  });
  const original = await asset?.arrayBuffer();
  const form = new FormData();
  form.set("image", png());
  form.set("metadata", JSON.stringify(metadata));
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/images`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    }),
  );
  expect(response.status).toBe(200);
  expect(uploadedImageSchema.parse(await response.json())).toEqual(first);
  expect(await (await env.TABLECAST_MEDIA.get(first.imageKey))?.arrayBuffer()).toEqual(original);
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    1,
  );
});

it.each(["image/jpeg", "image/webp"] as const)("%sをデコードしWebPへ統一する", async (type) => {
  const { staff } = await setupFixture();
  const output = await env.TABLECAST_IMAGES.input(png().stream()).output({ format: type });
  const image = new File([await output.response().arrayBuffer()], "tablecast-input", { type });
  const saved = await saveMenuImage(createApiServices(env), staff, image, metadata);
  const asset = await env.TABLECAST_MEDIA.get(saved.imageKey);
  if (!asset) throw new Error("保存画像がありません");
  const info = await env.TABLECAST_IMAGES.info(asset.body);
  expect(info).toMatchObject({ width: 1, height: 1 });
});

it("2MiBを超える画像も管理APIの本文上限内で取り込める", async () => {
  const { staff, cookie } = await setupFixture();
  const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
  bytes.set(new Uint8Array(await png().arrayBuffer()));
  const form = new FormData();
  form.set("image", new File([bytes], "tablecast-large.png", { type: "image/png" }));
  form.set("metadata", JSON.stringify(metadata));
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/images`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    }),
  );
  expect(response.status).toBe(200);
});

it("1600万画素を超える画像を変換・保存前に拒否する", async () => {
  const { staff } = await setupFixture();
  const large = await env.TABLECAST_IMAGES.input(png().stream())
    .transform({ width: 4001, height: 4000, fit: "squeeze" })
    .output({ format: "image/png" });
  const image = new File([await large.response().arrayBuffer()], "tablecast-large.png", {
    type: "image/png",
  });
  await expect(saveMenuImage(createApiServices(env), staff, image, metadata)).rejects.toMatchObject(
    { code: "INVALID_IMAGE" },
  );
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    0,
  );
});

it("不正Base64・偽装形式・破損画像・容量超過・生成写真を保存しない", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  for (const value of ["%%%%", "data:image/png;base64," + data, "AAAA=", "AB=="]) {
    await expect(uploadImage(services, staff, { ...input, data: value })).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  }
  for (const image of [
    new File(["not an image"], "tablecast.png", { type: "image/png" }),
    new File([await png().arrayBuffer()], "tablecast.jpg", { type: "image/jpeg" }),
    new File(["<svg xmlns='http://www.w3.org/2000/svg'/ >"], "tablecast.svg", {
      type: "image/svg+xml",
    }),
    new File([new Uint8Array(maxImageBytes + 1)], "tablecast.png", { type: "image/png" }),
    new File([], "empty.png", { type: "image/png" }),
  ]) {
    await expect(saveMenuImage(services, staff, image, metadata)).rejects.toMatchObject({
      code: "INVALID_IMAGE",
    });
  }
  await expect(
    uploadImage(services, staff, { ...input, imageKind: "photograph" }),
  ).rejects.toMatchObject({ code: "GENERATED_IMAGE_MUST_BE_ILLUSTRATION" });
  expect((await env.TABLECAST_MEDIA.list({ prefix: "tablecast/uploads/" })).objects).toHaveLength(
    0,
  );
});

it("他店舗の画像・出所の改ざん・消えた画像を下書きと公開で拒否する", async () => {
  const { staff } = await setupFixture();
  const services = createApiServices(env);
  const saved = await uploadImage(services, staff, input);
  const other = { ...staff, storeId: "tablecast-other-store" };
  const foreign = await uploadImage(services, other, input);
  expect(foreign.imageKey).not.toBe(saved.imageKey);
  let draft = await createDraft(services, staff);
  const configuration = structuredClone(draft.configuration);
  const product = configuration.products[0];
  if (!product) throw new Error("商品fixtureがありません");
  Object.assign(product, { imageKey: foreign.imageKey, ...metadata });
  await expect(
    updateDraft(services, staff, draft.id, { expectedVersion: draft.version, configuration }),
  ).rejects.toMatchObject({ code: "IMAGE_FORBIDDEN" });
  product.imageKey = saved.imageKey;
  product.imageKind = "photograph";
  await expect(
    updateDraft(services, staff, draft.id, { expectedVersion: draft.version, configuration }),
  ).rejects.toMatchObject({ code: "IMAGE_METADATA_MISMATCH" });
  product.imageKind = "illustration";
  draft = await updateDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    configuration,
  });
  await validateDraft(services, staff, draft.id, draft.version);
  await env.TABLECAST_MEDIA.delete(saved.imageKey);
  await expect(
    publishDraft(services, staff, draft.id, {
      expectedVersion: draft.version,
      baseVersion: draft.baseVersion,
      idempotencyKey: "tablecast-missing-image-publication",
      approved: true,
    }),
  ).rejects.toMatchObject({ code: "IMAGE_NOT_FOUND" });
});

it("管理APIは未認証・不正な出所JSONを拒否する", async () => {
  const { staff, cookie } = await setupFixture();
  for (const authenticated of [false, true]) {
    const form = new FormData();
    form.set("image", png());
    form.set("metadata", "invalid json");
    const response = await exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/stores/${staff.storeId}/images`, {
        method: "POST",
        headers: authenticated ? { Cookie: cookie } : {},
        body: form,
      }),
    );
    expect(response.status).toBe(authenticated ? 422 : 401);
  }
});
