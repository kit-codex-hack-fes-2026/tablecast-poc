import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readSeedTemplate, writeSeedTemplate } from "./tablecast-seed-template";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function templatePath() {
  const directory = await mkdtemp(join(tmpdir(), "tablecast-seed-template-"));
  directories.push(directory);
  return join(directory, "seed.json");
}

describe("初期seedの固定テンプレート", () => {
  test("独立した二回の生成が同じbyte列になり、現在の入力として読める", async () => {
    const first = await templatePath();
    const second = await templatePath();
    const template = await writeSeedTemplate(first);
    await writeSeedTemplate(second);
    expect(await readFile(first, "utf8")).toBe(await readFile(second, "utf8"));
    expect(await readSeedTemplate(first)).toEqual(template);
    expect(template.payload.stores).toHaveLength(3);
    expect(template.payload.staff).toHaveLength(8);
    expect(template.payloadHash).toBe(
      createHash("sha256").update(JSON.stringify(template.payload)).digest("hex"),
    );
  });

  test("内容の破損と古い入力hashを拒否する", async () => {
    const path = await templatePath();
    const template = await writeSeedTemplate(path);
    await writeFile(
      path,
      JSON.stringify({ ...template, payload: { ...template.payload, staff: [] } }),
    );
    await expect(readSeedTemplate(path)).rejects.toThrow(/staff/);
    await writeFile(path, JSON.stringify({ ...template, payloadHash: "0".repeat(64) }));
    await expect(readSeedTemplate(path)).rejects.toThrow("内容hash");
    const text = JSON.stringify(template);
    expect(text).toContain(',"aliases":[]');
    await writeFile(path, text.replace(',"aliases":[]', ""));
    await expect(readSeedTemplate(path)).rejects.toThrow("内容hash");
    await writeFile(path, JSON.stringify({ ...template, sourceHash: "0".repeat(64) }));
    await expect(readSeedTemplate(path)).rejects.toThrow("入力hash");
  });

  test("認証情報などの余分なfieldと、不正な構成をhashが合っていても拒否する", async () => {
    const path = await templatePath();
    const template = await writeSeedTemplate(path);
    await writeFile(path, JSON.stringify({ ...template, password: "secret" }));
    await expect(readSeedTemplate(path)).rejects.toThrow(/password/);
    const store = template.payload.stores[0];
    const product = store?.configuration.products[0];
    if (!product) throw new Error("検証対象の商品がありません。");
    product.categoryId = "tablecast-missing-category";
    template.payloadHash = createHash("sha256")
      .update(JSON.stringify(template.payload))
      .digest("hex");
    await writeFile(path, JSON.stringify(template));
    await expect(readSeedTemplate(path)).rejects.toThrow("seed構成が不正");
  });
});
