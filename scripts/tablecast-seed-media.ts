import type { Configuration, ThemeImage } from "@tablecast/api/schema";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { tablecastDemoStoreIcons } from "../apps/emulate/src/tablecast-demo-identities.ts";

const directory = resolve(import.meta.dirname, "../assets/demo");
const keys = new Map<string, string>();
export function imageKey(bytes: Uint8Array, format: "png" | "webp" = "png") {
  return `tablecast/images/${createHash("sha256").update(bytes).digest("hex")}.${format}`;
}
export function demoImageKey(file: string) {
  let key = keys.get(file);
  if (!key) {
    key = imageKey(
      readFileSync(resolve(directory, file)),
      extname(file) === ".webp" ? "webp" : "png",
    );
    keys.set(file, key);
  }
  return key;
}
function storeLogoAsset(storeId: string, kind: "banner" | "logo" = "logo") {
  const icon = tablecastDemoStoreIcons[storeId];
  const file = kind === "banner" ? icon?.replace("-logo.webp", "-banner.webp") : icon;
  if (!file) throw new Error("店舗ロゴ素材がありません。");
  const metadata = {
    imageKind: "illustration" as const,
    imageSource: {
      generated: true,
      description:
        kind === "banner"
          ? "架空店舗の横長ロゴとして生成したデモ用バナー"
          : "架空店舗のデモ用に生成したロゴ",
    },
  };
  const bytes = readFileSync(resolve(directory, "identities", file));
  // 通常の画像取込と同じく、店舗・出所・画像内容を一つのidentityにする。
  const hash = createHash("sha256")
    .update(JSON.stringify({ storeId, ...metadata }))
    .update(bytes)
    .digest("hex");
  return { imageKey: `tablecast/uploads/${hash}.webp`, metadata };
}

export function demoStoreLogo(storeId: string, name: string): ThemeImage {
  const asset = storeLogoAsset(storeId);
  return {
    imageKey: asset.imageKey,
    ...asset.metadata,
    alt: { ja: `${name}のロゴ`, en: `${name} logo` },
  };
}

export function demoStoreBanner(storeId: string, name: string): ThemeImage {
  const asset = storeLogoAsset(storeId, "banner");
  return {
    imageKey: asset.imageKey,
    ...asset.metadata,
    alt: { ja: `${name}の横長バナー`, en: `${name} header banner` },
  };
}

// seedと静的プレビューで同じ画像identityを使う。
export function demoMediaAsset(file: string, bytes: Uint8Array) {
  const storeId = Object.entries(tablecastDemoStoreIcons).find(
    ([, icon]) =>
      file === `identities/${icon}` ||
      file === `identities/${icon.replace("-logo.webp", "-banner.webp")}`,
  )?.[0];
  const logo = storeId
    ? storeLogoAsset(storeId, file.endsWith("-banner.webp") ? "banner" : "logo")
    : undefined;
  return {
    key: logo?.imageKey ?? imageKey(bytes, extname(file) === ".webp" ? "webp" : "png"),
    metadata: logo && storeId ? { storeId, metadata: JSON.stringify(logo.metadata) } : undefined,
  };
}

export async function seedMenuImages(
  bucket: Parameters<typeof uploadPreviewImage>[0] & Pick<R2Bucket, "list">,
  legacy = false,
  configurations?: readonly Configuration[],
) {
  const files = [
    ...(await readdir(directory)).filter((name) => /^[a-z0-9-]+\.(png|webp)$/.test(name)),
    ...(await readdir(resolve(directory, "identities")))
      .filter((name) => name.endsWith("-logo.webp") || name.endsWith("-banner.webp"))
      .map((name) => `identities/${name}`),
  ].sort();
  const required =
    configurations && !legacy
      ? new Set(
          configurations.flatMap((config) =>
            [
              config.branding?.logo?.imageKey,
              config.branding?.banner?.imageKey,
              ...config.products.flatMap((product) => [
                product.imageKey,
                ...product.modifiers.flatMap((modifier) =>
                  modifier.options.map((option) => option.imageKey),
                ),
              ]),
            ].filter((key): key is string => Boolean(key)),
          ),
        )
      : undefined;
  console.time("商品画像の投入");
  try {
    const existing = new Map<string, R2Object>();
    console.time("商品画像の既存一覧");
    try {
      for (const prefix of legacy
        ? ["tablecast/images/", "tablecast/demo/", "tablecast/uploads/"]
        : ["tablecast/"]) {
        let cursor: string | undefined;
        do {
          const page = await bucket.list({ prefix, limit: 1000, cursor });
          for (const object of page.objects) existing.set(object.key, object);
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);
      }
    } finally {
      console.timeEnd("商品画像の既存一覧");
    }
    let uploaded = 0;
    let confirmed = 0;
    let uploadedBytes = 0;
    const remaining = files.values();
    let failed = false;
    console.time("商品画像の照合・送信");
    try {
      // 空いた枠から次の画像を送り、失敗時は未開始の処理を止めて開始済みを回収する。
      const results = await Promise.allSettled(
        Array.from({ length: 4 }, async () => {
          while (!failed) {
            const file = remaining.next().value;
            if (!file) return;
            try {
              const bytes = await readFile(resolve(directory, file));
              const asset = demoMediaAsset(file, bytes);
              const key = asset.key;
              if (required && !required.has(key)) continue;
              for (const target of legacy ? [key, `tablecast/demo/${file}`] : [key]) {
                if (failed) return;
                const result = await uploadPreviewImage(
                  bucket,
                  target,
                  bytes,
                  undefined,
                  existing.get(target) ?? null,
                  asset.metadata,
                );
                if (result === "uploaded") {
                  uploaded++;
                  uploadedBytes += bytes.length;
                } else confirmed++;
              }
            } catch (error) {
              failed = true;
              throw error;
            }
          }
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    } finally {
      console.timeEnd("商品画像の照合・送信");
    }
    const result = { uploaded, confirmed, uploadedBytes };
    console.info(`商品画像: 投入 ${uploaded}件・既存 ${confirmed}件・送信 ${uploadedBytes} B`);
    return result;
  } finally {
    console.timeEnd("商品画像の投入");
  }
}

export async function uploadPreviewImage(
  bucket: Pick<R2Bucket, "head"> & {
    put(
      key: string,
      bytes: Uint8Array,
      options: R2PutOptions & { onlyIf: R2Conditional },
    ): Promise<null | R2Object>;
  },
  key: string,
  bytes: Uint8Array,
  contentType: "image/png" | "image/webp" = key.endsWith(".webp") ? "image/webp" : "image/png",
  known?: null | Pick<R2Object, "etag" | "size">,
  customMetadata: Record<string, string> = { source: "synthetic-demo" },
) {
  const md5 = createHash("md5").update(bytes).digest("hex");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // 一覧で確認済みなら初回HEADを省き、再試行では応答を失ったPUTも確認する。
      const stored = attempt === 1 && known !== undefined ? known : await bucket.head(key);
      if (stored) {
        if (stored.etag !== md5 || stored.size !== bytes.length)
          throw new Error("既存画像の内容が一致しません");
        return "confirmed";
      }
      const uploaded = await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        md5,
        httpMetadata: { contentType },
        customMetadata,
      });
      if (!uploaded || uploaded.etag !== md5 || uploaded.size !== bytes.length)
        throw new Error("画像の保存結果を確認できません");
      return "uploaded";
    } catch (error) {
      const code = error instanceof Error ? /\((\d+)\)$/.exec(error.message)?.[1] : undefined;
      // code0はHTTP分類を失った応答なので、既存の上限内だけ保存結果を再確認する。
      if ((code !== "10001" && code !== "0") || attempt === 3)
        throw new Error(
          `R2画像投入失敗: ${key} (code=${code ?? "整合性・接続"}, attempt=${attempt})`,
          { cause: error },
        );
      console.warn(`R2画像投入を再試行: ${key} (code=${code}, attempt=${attempt}/3)`);
      await new Promise((complete) => setTimeout(complete, 1_000 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`R2画像投入の再試行上限に達しました: ${key}`);
}
