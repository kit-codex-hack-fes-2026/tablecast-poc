import { expect } from "@playwright/test";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "./support/test";

// 同じworkerで変更と次ケースの復元を観測するため、この2件だけ順序を固定する。
test.describe("worker再利用時の配信ファイルの隔離", () => {
  test.describe.configure({ mode: "serial" });
  const marker = "tablecast-worker-asset-isolation";
  const addedAsset = "tablecast-added-by-previous-test.txt";

  test("ケース内の再起動では配信ファイルの変更を維持する", async ({ runtime, request }) => {
    await appendFile(join(runtime.directory, "client/sw.js"), `\n// ${marker}\n`);
    await writeFile(join(runtime.directory, "client", addedAsset), marker);
    await runtime.restartWeb();

    expect(await (await request.get("/sw.js")).text()).toContain(marker);
    expect(await (await request.get(`/${addedAsset}`)).text()).toBe(marker);
  });

  test("次のケースでは変更と追加ファイルを持ち越さない", async ({ request }) => {
    const serviceWorker = await request.get("/sw.js");
    expect(serviceWorker.ok()).toBe(true);
    expect(await serviceWorker.text()).not.toContain(marker);
    expect(await (await request.get(`/${addedAsset}`)).text()).not.toBe(marker);
  });
});
