import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import type { Configuration } from "../configuration/model";
import { imageMetadataSchema, maxImageBytes, uploadImageSchema } from "./model";

export async function uploadImage(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uploadImageSchema>,
) {
  requireManager(actor);
  const parsed = uploadImageSchema.parse(input);
  let decoded: Uint8Array<ArrayBuffer>;
  try {
    decoded = Uint8Array.fromBase64(parsed.data, { lastChunkHandling: "strict" });
  } catch {
    throw new DomainError("INVALID_IMAGE", 422, "INVALID_IMAGE");
  }
  ensure(decoded.toBase64() === parsed.data, "INVALID_IMAGE", 422);
  return saveMenuImage(
    services,
    actor,
    new File([decoded], "tablecast-image", { type: parsed.mimeType }),
    {
      imageKind: parsed.imageKind,
      imageSource: parsed.imageSource,
    },
  );
}

export async function saveMenuImage(
  services: ApiServices,
  actor: Actor,
  image: File,
  input: z.infer<typeof imageMetadataSchema>,
) {
  requireManager(actor);
  const metadata = imageMetadataSchema.parse(input);
  ensure(
    !metadata.imageSource.generated || metadata.imageKind === "illustration",
    "GENERATED_IMAGE_MUST_BE_ILLUSTRATION",
    422,
  );
  await validatedImageBytes(image, maxImageBytes);
  let bytes: ArrayBuffer;
  try {
    const info = await services.env.TABLECAST_IMAGES.info(image.stream());
    ensure(
      "width" in info &&
        "height" in info &&
        info.width > 0 &&
        info.height > 0 &&
        info.width * info.height <= 16_000_000 &&
        info.format === image.type,
      "INVALID_IMAGE",
      422,
    );
    const output = await services.env.TABLECAST_IMAGES.input(image.stream())
      .transform({ width: 1600, height: 1600, fit: "scale-down" })
      .output({ format: "image/webp", quality: 85, anim: false });
    bytes = await output.response().arrayBuffer();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const code = z.object({ code: z.number() }).safeParse(error);
    if (code.success && [9401, 9412, 9413].includes(code.data.code)) {
      throw new DomainError("INVALID_IMAGE", 422, "INVALID_IMAGE");
    }
    throw new DomainError("IMAGE_PROCESSING_FAILED", 503, "IMAGE_PROCESSING_FAILED");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await new Blob([JSON.stringify({ storeId: actor.storeId, ...metadata }), bytes]).arrayBuffer(),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const imageKey = `tablecast/uploads/${hash}.webp`;
  // 同一店舗・画像・出所の再送は同じキーへ収束し、応答消失後も下書きから再開できる。
  await services.env.TABLECAST_MEDIA.put(imageKey, bytes, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: { storeId: actor.storeId, metadata: JSON.stringify(metadata) },
    onlyIf: { etagDoesNotMatch: "*" },
  });
  return {
    imageKey,
    ...metadata,
    url: `${services.env.TABLECAST_PUBLIC_ORIGIN}/media/${imageKey}`,
  };
}

export async function requireConfigurationImages(
  services: ApiServices,
  actor: Actor,
  configuration: Configuration,
) {
  const images = configuration.products.filter((product) =>
    product.imageKey?.startsWith("tablecast/uploads/"),
  );
  const stored = new Map(
    await Promise.all(
      [...new Set(images.map((product) => product.imageKey))].map(async (key) => {
        ensure(key, "IMAGE_NOT_FOUND", 422);
        return [key, await services.env.TABLECAST_MEDIA.head(key)] as const;
      }),
    ),
  );
  for (const product of images) {
    ensure(product.imageKey, "IMAGE_NOT_FOUND", 422);
    const asset = stored.get(product.imageKey);
    ensure(asset, "IMAGE_NOT_FOUND", 422);
    ensure(asset.customMetadata?.storeId === actor.storeId, "IMAGE_FORBIDDEN", 403);
    const metadata = imageMetadataSchema.parse(JSON.parse(asset.customMetadata.metadata ?? "null"));
    ensure(
      product.imageKind === metadata.imageKind &&
        product.imageSource?.generated === metadata.imageSource.generated &&
        product.imageSource?.description === metadata.imageSource.description,
      "IMAGE_METADATA_MISMATCH",
      422,
    );
  }
}

export async function saveIdentityImage(
  env: Pick<TablecastEnv, "TABLECAST_MEDIA" | "TABLECAST_PUBLIC_ORIGIN">,
  image: File,
) {
  const bytes = await validatedImageBytes(image, 1024 * 1024);
  const key = crypto.randomUUID();
  await env.TABLECAST_MEDIA.put(`tablecast/avatars/${key}`, bytes, {
    httpMetadata: { contentType: image.type },
  });
  return `${env.TABLECAST_PUBLIC_ORIGIN}/api/avatars/${key}`;
}

async function validatedImageBytes(image: File, maxBytes: number) {
  ensure(image.size > 0 && image.size <= maxBytes, "INVALID_IMAGE", 422);
  const bytes = new Uint8Array(await image.arrayBuffer());
  const valid =
    (image.type === "image/png" &&
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71) ||
    (image.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (image.type === "image/webp" &&
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP");
  ensure(valid, "INVALID_IMAGE", 422);
  return bytes;
}
