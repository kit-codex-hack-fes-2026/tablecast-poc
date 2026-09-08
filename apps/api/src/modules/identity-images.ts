import { ensure } from "../errors";

export async function saveIdentityImage(
  env: Pick<TablecastEnv, "TABLECAST_MEDIA" | "TABLECAST_PUBLIC_ORIGIN">,
  image: File,
) {
  ensure(image.size > 0 && image.size <= 1024 * 1024, "INVALID_IMAGE", 422);
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
  const key = crypto.randomUUID();
  await env.TABLECAST_MEDIA.put(`tablecast/avatars/${key}`, bytes, {
    httpMetadata: { contentType: image.type },
  });
  return `${env.TABLECAST_PUBLIC_ORIGIN}/api/avatars/${key}`;
}
