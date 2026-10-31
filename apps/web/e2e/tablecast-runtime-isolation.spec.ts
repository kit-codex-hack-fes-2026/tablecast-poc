import { expect } from "@playwright/test";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { credentials } from "./support/runtime";
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off" });

// 同じworkerで変更と次ケースの復元を観測するため、この2件だけ順序を固定する。
test.describe("worker再利用時のD1と配信ファイルの隔離", () => {
  test.describe.configure({ mode: "serial" });
  const marker = "tablecast-worker-asset-isolation";
  const addedAsset = "tablecast-added-by-previous-test.txt";
  const sessionSchema = z.object({ user: z.object({ name: z.string(), email: z.string() }) });

  test("ケース内の再起動ではD1と配信ファイルの変更を維持する", async ({
    runtime,
    request,
    baseURL,
  }) => {
    await signInStaff(request, baseURL);
    const updated = await request.post("/api/auth/update-user", {
      headers: { Origin: baseURL ?? "" },
      data: { name: marker },
    });
    expect(updated.status()).toBe(200);
    await appendFile(
      join(runtime.directory, ".cloudflare/output/v0/workers/default/assets/sw.js"),
      `\n// ${marker}\n`,
    );
    await writeFile(
      join(runtime.directory, ".cloudflare/output/v0/workers/default/assets", addedAsset),
      marker,
    );
    await runtime.restartWeb();

    const session = sessionSchema.parse(await (await request.get("/api/auth/get-session")).json());
    expect(session.user).toEqual({ name: marker, email: credentials.email });
    expect(await (await request.get("/sw.js")).text()).toContain(marker);
    expect(await (await request.get(`/${addedAsset}`)).text()).toBe(marker);
  });

  test("次のケースではD1の変更と追加ファイルを持ち越さない", async ({ request, baseURL }) => {
    await signInStaff(request, baseURL);
    const session = sessionSchema.parse(await (await request.get("/api/auth/get-session")).json());
    expect(session.user.email).toBe(credentials.email);
    expect(session.user.name).not.toBe(marker);
    const serviceWorker = await request.get("/sw.js");
    expect(serviceWorker.ok()).toBe(true);
    expect(await serviceWorker.text()).not.toContain(marker);
    expect(await (await request.get(`/${addedAsset}`)).text()).not.toBe(marker);
  });
});
