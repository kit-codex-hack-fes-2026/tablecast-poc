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
  ensure(
    parsed.file
      ? parsed.data === undefined && parsed.mimeType === undefined
      : parsed.data !== undefined && parsed.mimeType !== undefined,
    "IMAGE_INPUT_REQUIRED",
    422,
  );
  if (parsed.file) {
    return saveMenuImage(services, actor, await downloadImage(parsed.file), {
      imageKind: parsed.imageKind,
      imageSource: parsed.imageSource,
    });
  }
  ensure(parsed.data && parsed.mimeType, "IMAGE_INPUT_REQUIRED", 422);
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

async function downloadImage(file: NonNullable<z.infer<typeof uploadImageSchema>["file"]>) {
  const signal = AbortSignal.timeout(15_000);
  let url = new URL(file.download_url);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      // ChatGPTのファイル配信先に限定し、各転送先でも認証情報・任意port・別hostを拒否する。
      ensure(
        url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.port &&
          (url.hostname === "oaiusercontent.com" ||
            url.hostname.endsWith(".oaiusercontent.com") ||
            /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(url.hostname)),
        "IMAGE_URL_FORBIDDEN",
        422,
      );
      const response = await fetch(url, { redirect: "manual", signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("Location");
        ensure(location && redirects < 3, "IMAGE_DOWNLOAD_FAILED", 422);
        url = new URL(location, url);
        continue;
      }
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get("Content-Length")) > maxImageBytes
      ) {
        await response.body?.cancel();
        throw new DomainError("IMAGE_DOWNLOAD_FAILED", 422, "IMAGE_DOWNLOAD_FAILED");
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          ensure(size <= maxImageBytes, "INVALID_IMAGE", 422);
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
      const headerType = response.headers.get("Content-Type")?.split(";")[0]?.trim();
      const mimeType =
        file.mime_type ??
        (headerType && headerType !== "application/octet-stream"
          ? headerType
          : imageMimeType(bytes));
      return new File([bytes], "tablecast-image", { type: mimeType });
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // 期限付きURLや署名を例外・tool応答へ出さない。
    throw new DomainError("IMAGE_DOWNLOAD_FAILED", 503, "IMAGE_DOWNLOAD_FAILED");
  }
  throw new DomainError("IMAGE_DOWNLOAD_FAILED", 422, "IMAGE_DOWNLOAD_FAILED");
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
  const images = [
    ...[
      configuration.branding?.logo,
      ...Object.values(configuration.appearance?.assets ?? {}),
      ...(configuration.banners ?? []).map((banner) => banner.image),
    ]
      .filter((image) => image != null)
      .map((image) => ({ ...image, verifySource: true })),
    ...configuration.products.map((product) => ({ ...product, verifySource: true })),
    ...configuration.products.flatMap((product) =>
      product.modifiers.flatMap((modifier) =>
        modifier.options.map((option) => ({
          ...option,
          imageSource: undefined,
          verifySource: false,
        })),
      ),
    ),
  ].filter((image) => image.imageKey?.startsWith("tablecast/uploads/"));
  return requireImageAssets(services, actor, images);
}

export async function requireImageAssets(
  services: ApiServices,
  actor: Actor,
  images: {
    imageKey?: string | null;
    imageKind: z.infer<typeof imageMetadataSchema>["imageKind"];
    imageSource?: z.infer<typeof imageMetadataSchema>["imageSource"] | null;
    verifySource: boolean;
  }[],
) {
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
        (!product.verifySource ||
          (product.imageSource?.generated === metadata.imageSource.generated &&
            product.imageSource?.description === metadata.imageSource.description)),
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
  ensure(imageMimeType(bytes) === image.type, "INVALID_IMAGE", 422);
  return bytes;
}

function imageMimeType(bytes: Uint8Array) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return undefined;
}
