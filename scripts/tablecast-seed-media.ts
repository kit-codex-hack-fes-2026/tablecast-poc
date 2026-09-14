import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

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
export async function seedMenuImages(
  bucket: Parameters<typeof uploadPreviewImage>[0],
  legacy = false,
) {
  const files = (await readdir(directory))
    .filter((name) => /^[a-z0-9-]+\.(png|webp)$/.test(name))
    .sort();
  console.time("商品画像の投入");
  try {
    for (let offset = 0; offset < files.length; offset += 4) {
      // 失敗した場合も開始済みのR2操作を回収してからbindingを解放する。
      const results = await Promise.allSettled(
        files.slice(offset, offset + 4).map(async (file) => {
          const bytes = await readFile(resolve(directory, file));
          await uploadPreviewImage(
            bucket,
            imageKey(bytes, extname(file) === ".webp" ? "webp" : "png"),
            bytes,
          );
          if (legacy) await uploadPreviewImage(bucket, `tablecast/demo/${file}`, bytes);
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    }
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
    ): Promise<R2Object | null>;
  },
  key: string,
  bytes: Uint8Array,
  contentType: "image/png" | "image/webp" = key.endsWith(".webp") ? "image/webp" : "image/png",
) {
  const md5 = createHash("md5").update(bytes).digest("hex");
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const stored = await bucket.head(key);
      if (stored) {
        if (stored.etag !== md5 || stored.size !== bytes.length)
          throw new Error("既存画像の内容が一致しません");
        console.info(`画像確認済み: ${key}`);
        return;
      }
      const uploaded = await bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        md5,
        httpMetadata: { contentType },
        customMetadata: { source: "synthetic-demo" },
      });
      if (!uploaded || uploaded.etag !== md5 || uploaded.size !== bytes.length)
        throw new Error("画像の保存結果を確認できません");
      console.info(`画像投入済み: ${key}`);
      return;
    } catch (error) {
      const code = error instanceof Error ? /\((\d+)\)$/.exec(error.message)?.[1] : undefined;
      if (code !== "10001" || attempt === 3)
        throw new Error(
          `R2画像投入失敗: ${key} (code=${code ?? "整合性・接続"}, attempt=${attempt})`,
          { cause: error },
        );
      console.warn(`R2一時障害: ${key} (code=${code}, attempt=${attempt}/3)`);
      await new Promise((complete) => setTimeout(complete, 1_000 * 2 ** (attempt - 1)));
    }
  }
}
