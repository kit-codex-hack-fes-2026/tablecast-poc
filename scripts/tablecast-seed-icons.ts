import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { uploadPreviewImage } from "./tablecast-seed-media";

function iconUrl(content: string | Uint8Array) {
  const hash = createHash("sha256").update(content).digest("hex");
  const key = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  return `/api/avatars/${key}`;
}

// 旧seedの固定URLだけを識別し、手動設定された画像を更新対象にしない。
export function legacyIdentityIconUrl(kind: "user" | "store", identity: string) {
  return iconUrl(`tablecast-icon-${kind}-${identity}`);
}

export async function seedIdentityIcon(env: Pick<TablecastEnv, "TABLECAST_MEDIA">, file: string) {
  const bytes = await readFile(new URL(`../assets/demo/identities/${file}`, import.meta.url));
  const url = iconUrl(bytes);
  await uploadPreviewImage(
    env.TABLECAST_MEDIA,
    `tablecast/avatars/${url.split("/").at(-1)}`,
    bytes,
    "image/webp",
  );
  return url;
}
