import { createHash } from "node:crypto";

// 外部サービスや実在人物の写真を使わない、固定IDのデモ用アイコン。
export async function seedIdentityIcon(
  env: TablecastEnv,
  kind: "user" | "store",
  identity: string,
) {
  const hash = createHash("sha256").update(`tablecast-icon-${kind}-${identity}`).digest("hex");
  const key = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const index = Number.parseInt(hash.slice(0, 2), 16);
  const backgrounds = ["#e6ddd4", "#dce3dc", "#e6dce1", "#dce1e8"];
  const colours = ["#65564c", "#465c50", "#765361", "#49586e"];
  const background = backgrounds[index % backgrounds.length];
  const colour = colours[index % colours.length];
  const mark =
    kind === "user"
      ? `<path d="M14 96v-12c0-23 17-34 34-34s34 11 34 34v12" fill="${colour}"/><circle cx="48" cy="37" r="21" fill="#f6e8d9"/><path d="M26 36c-3-32 47-34 45 0-14-1-22-12-23-15-2 9-13 14-22 15" fill="#393532"/>`
      : `<g fill="${colour}">${Array.from({ length: 5 }, (_, i) => `<ellipse cx="48" cy="30" rx="11" ry="19" transform="rotate(${i * 72} 48 48)"/>`).join("")}<circle cx="48" cy="48" r="9" fill="${background}"/></g>`;
  await env.TABLECAST_MEDIA.put(
    `tablecast/avatars/${key}`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="16" fill="${background}"/>${mark}</svg>`,
    {
      httpMetadata: { contentType: "image/svg+xml" },
      customMetadata: { source: "synthetic-demo" },
    },
  );
  return `/api/avatars/${key}`;
}
