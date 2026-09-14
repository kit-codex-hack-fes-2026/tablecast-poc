import { expect, type BrowserContext, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { adminStateSchema, catalogSchema, tableStateSchema } from "../../api/src/schema";
import { test } from "../../web/e2e/support/test";
import { credentials } from "../../web/e2e/support/runtime";
import ja from "../../web/messages/ja.json" with { type: "json" };

const execute = promisify(execFile);
const viewport = { width: 1024, height: 768 };

test("PRの実アプリで注文・提供・会計を操作し、今回の録画をMP4へ保存する", async ({
  page: setup,
  browser,
  baseURL,
  releaseSha,
}, testInfo) => {
  const store = "/api/admin/stores/tablecast-komorebi";
  const floor = "/admin/stores/tablecast-komorebi/floor";
  const health = await setup.request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ status: "ok", releaseSha });
  // 認証と端末登録は録画を始める前に済ませ、資格情報を成果物へ残さない。
  const login = await setup.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL ?? "" },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(login.ok()).toBe(true);
  const state = adminStateSchema.parse(await (await setup.request.get(store)).json());
  const vacant = state.vacantTables[0];
  if (!vacant) throw new Error("収録用の空卓がありません");
  expect(
    (
      await setup.request.post(`${store}/tables/open`, {
        data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
      })
    ).ok(),
  ).toBe(true);

  const pairing = await browser.newContext({ baseURL, viewport });
  const contexts: BrowserContext[] = [pairing];
  const recordings: { role: string; page: Page }[] = [];
  const events: { role: string; action: string; at: string }[] = [];
  const shot = async (page: Page, role: string, action: string) => {
    events.push({ role, action, at: new Date().toISOString() });
    await page.screenshot({ path: testInfo.outputPath(`${role}-${events.length}.png`) });
    // 成功状態は呼出し側で確認済み。これは視聴時に読める時間を確保する保持である。
    await page.waitForTimeout(1500);
  };
  try {
    const device = await pairing.newPage();
    await device.goto("/");
    await device.getByRole("button", { name: "端末を接続する" }).click();
    const code = device.getByLabel("端末に表示されたコード");
    await expect(code).toHaveText(/\S+/);
    await setup.goto("/admin/stores/tablecast-komorebi/devices/new");
    await setup.getByLabel(ja.admin_pair_code).fill((await code.textContent()) ?? "");
    await setup
      .getByRole("row")
      .filter({ has: setup.getByRole("cell", { name: vacant.name, exact: true }) })
      .getByRole("button")
      .click();
    await setup.getByRole("button", { name: ja.admin_approve, exact: true }).click();
    await expect(device.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();

    const customerContext = await browser.newContext({
      baseURL,
      viewport,
      storageState: await pairing.storageState(),
      recordVideo: { dir: testInfo.outputPath("raw"), size: viewport },
    });
    contexts.push(customerContext);
    const guest = await customerContext.newPage();
    recordings.push({ role: "customer", page: guest });
    await guest.goto("/");
    await guest.getByRole("tab", { name: ja.kiosk_menu, exact: true }).click();
    const catalog = catalogSchema.parse(
      await (await guest.request.get("/api/table/catalog")).json(),
    );
    const product = catalog.configuration.products.find(
      (item) => item.available && item.modifiers.length === 0,
    );
    if (!product) throw new Error("選択肢なしで注文できる収録用商品がありません");
    await expect(guest.getByText(product.text.ja.displayName, { exact: true })).toBeVisible();
    await shot(guest, "customer", "今回のアプリのおしながきを表示");
    await guest
      .getByRole("button")
      .filter({ has: guest.getByText(product.text.ja.displayName, { exact: true }) })
      .click();
    await expect(guest.getByRole("button", { name: ja.kiosk_add, exact: true })).toBeEnabled();
    await shot(guest, "customer", "商品詳細を確認");
    await guest.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
    await guest.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
    await expect(
      guest.getByRole("region", { name: ja.kiosk_review_title, exact: true }),
    ).toBeVisible();
    await shot(guest, "customer", "注文内容と金額を確認");
    await guest.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
    await expect(guest.getByText(ja.kiosk_ordered, { exact: true })).toBeVisible();
    await shot(guest, "customer", "明示承認で注文を確定");
    await guest.getByRole("button", { name: ja.common_close, exact: true }).click();
    await guest.getByRole("tab", { name: ja.kiosk_bill, exact: true }).click();
    await guest.getByRole("button", { name: ja.kiosk_bill_request, exact: true }).click();
    await expect
      .poll(
        async () =>
          tableStateSchema.parse(await (await guest.request.get("/api/table")).json())
            .billRequested,
      )
      .toBe(true);
    const ordered = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(ordered.orders).toHaveLength(1);
    expect(ordered.cart.lines).toHaveLength(0);
    expect(ordered.billRequested).toBe(true);
    expect(ordered.orders[0]?.snapshot.lines[0]?.productId).toBe(product.id);
    await shot(guest, "customer", "実DBへ確定した注文の会計を依頼");
    await customerContext.close();

    const staffContext = await browser.newContext({
      baseURL,
      viewport,
      storageState: await setup.context().storageState(),
      recordVideo: { dir: testInfo.outputPath("raw"), size: viewport },
    });
    contexts.push(staffContext);
    const staff = await staffContext.newPage();
    recordings.push({ role: "staff", page: staff });
    await staff.goto(floor);
    await expect(staff.getByRole("heading", { name: ja.admin_live, exact: true })).toBeVisible();
    await shot(staff, "staff", "客側で確定した同じ注文を店側で確認");
    await staff.getByRole("button", { name: new RegExp(`^${vacant.name}\\b`) }).click();
    await staff.getByRole("tab", { name: ja.admin_orders, exact: true }).click();
    await expect(staff.getByText(product.text.ja.displayName, { exact: true })).toBeVisible();
    await shot(staff, "staff", "注文内容を確認して受付");
    await staff.getByRole("button", { name: ja.admin_accept, exact: true }).click();
    await staff.getByRole("button", { name: ja.admin_serve, exact: true }).click();
    await expect(staff.getByText(ja.order_served, { exact: true })).toBeVisible();
    await shot(staff, "staff", "提供済みへ更新");
    await staff.getByRole("tab", { name: ja.admin_payments, exact: true }).click();
    await staff.getByLabel(ja.admin_amount, { exact: true }).fill(String(ordered.bill.due));
    await staff.getByLabel(ja.admin_reason, { exact: true }).fill("デモ店舗での会計確認");
    await shot(staff, "staff", "会計金額を確認");
    await staff.getByRole("button", { name: ja.admin_payment, exact: true }).click();
    await expect
      .poll(
        async () =>
          tableStateSchema.parse(await (await device.request.get("/api/table")).json()).bill.due,
      )
      .toBe(0);
    const due = staff.locator('[data-ui="bill-total"] dd');
    await expect(due).toHaveText(/^[¥￥]0$/);
    await due.scrollIntoViewIfNeeded();
    await shot(staff, "staff", "実DBの残額が0円になったことを確認");
    await staffContext.close();

    const applicationStatus = await execute("git", [
      "status",
      "--porcelain",
      "--",
      ":(top)apps/api",
      ":(top)apps/web",
    ]);
    const videos: { role: string; sha256: string; seconds: number }[] = [];
    const report = {
      sourceSha: releaseSha,
      servedSha: releaseSha,
      dirtyApplicationFiles: applicationStatus.stdout.trim(),
      capture: "今回ビルドした実Web・API・D1のGUI操作。音声接客は無効、無音の録画。",
      events,
      videos,
    };
    for (const { role, page } of recordings) {
      const recording = page.video();
      if (!recording) throw new Error(`${role}の今回の録画がありません`);
      const directory = testInfo.outputPath(role);
      await mkdir(directory);
      const output = join(directory, "video.mp4");
      await execute("ffmpeg", [
        "-nostdin",
        "-v",
        "error",
        "-i",
        await recording.path(),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-movflags",
        "+faststart",
        "-an",
        output,
      ]);
      const probe = await execute("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        output,
      ]);
      const media = z
        .object({
          streams: z.array(
            z.object({ codec_name: z.string(), width: z.number(), height: z.number() }),
          ),
          format: z.object({ duration: z.coerce.number().positive() }),
        })
        .parse(JSON.parse(probe.stdout));
      expect(media.streams).toEqual([expect.objectContaining({ codec_name: "h264", ...viewport })]);
      await execute("ffmpeg", ["-v", "error", "-xerror", "-i", output, "-f", "null", "-"]);
      const playback = await browser.newPage();
      try {
        await playback.goto(pathToFileURL(output).href);
        const element = playback.locator("video");
        await element.evaluate(async (video: HTMLVideoElement) => {
          video.currentTime = 0;
          video.playbackRate = 1;
          await video.play();
        });
        await expect
          .poll(() => element.evaluate((video: HTMLVideoElement) => video.ended), {
            timeout: (media.format.duration + 15) * 1000,
          })
          .toBe(true);
        expect(await element.evaluate((video: HTMLVideoElement) => video.error)).toBeNull();
      } finally {
        await playback.close();
      }
      report.videos.push({
        role,
        sha256: createHash("sha256")
          .update(await readFile(output))
          .digest("hex"),
        seconds: media.format.duration,
      });
    }
    await writeFile(
      testInfo.outputPath("report.json"),
      JSON.stringify({ ...report, status: "recorded-and-checked" }, null, 2),
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
