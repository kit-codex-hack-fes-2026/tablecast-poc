import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { captureShot, shotSchema } from "./tablecast-shot";
import { createServer } from "node:http";
import { checkCaptureHealth } from "./tablecast-doctor";
import { pinWindowTitle } from "./tablecast-openscreen.ts";
import { captureBrowserPointer } from "./tablecast-capture-types.ts";

test("@product 画面がタイトルを変更しても録画対象名を保持し、実ポインター操作を区別する", async ({
  page,
}) => {
  await page.setContent("<title>初期画面</title><button>対象</button>");
  await page.evaluate(pinWindowTitle, "TableCast capture test");
  await page.evaluate(() => {
    document.title = "遷移後の画面";
  });
  await expect(page).toHaveTitle("TableCast capture test");
  await page.evaluate(captureBrowserPointer);
  await page.getByRole("button", { name: "対象" }).click();
  const events = await page.evaluate(() => window.tablecastPointerEvents);
  expect(events.map((event) => event.interactionType)).toEqual(["move", "click", "mouseup"]);
});

test("@product doctorは撮影と同じ仮想ホストへ接続し、リダイレクトを成功扱いしない", async () => {
  let redirect = false;
  const hosts: (string | undefined)[] = [];
  const server = createServer((request, response) => {
    hosts.push(request.headers.host);
    if (redirect && request.url === "/api/health") {
      response.writeHead(302, { location: "/login" }).end();
    } else response.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("検査用サーバーがありません");
    const host = `review.tablecast-poc.container.localhost:${address.port}`;
    expect(await checkCaptureHealth(`http://${host}`)).toBe(200);
    expect(hosts).toContain(host);
    redirect = true;
    await expect(checkCaptureHealth(`http://${host}`)).rejects.toThrow("ヘルスチェック");
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});

test("@product 別アプリの成立条件を待ち、変更後のUI位置を再実測する", async ({ page }, info) => {
  const out = info.outputPath("booking");
  await mkdir(out, { recursive: true });
  await page.setContent(
    '<button>確定</button><article style="margin:40px;width:320px;height:80px" hidden>予約済み 2名</article>',
  );
  const shot = shotSchema.parse({
    intent: "予約の成立",
    state: "booking-saved",
    steps: [],
    subject: { selector: "article", required: ["予約済み", "2名"] },
    hold: 2.5,
  });
  await expect(captureShot(page, "reservation", shot, out)).rejects.toThrow("状態待ちが未指定");
  const wait = async (state: string) => {
    expect(state).toBe("booking-saved");
    await page.locator("article").evaluate((n) => {
      if (n instanceof HTMLElement) n.hidden = false;
    });
    await expect(page.locator("article")).toBeVisible();
  };
  const first = await captureShot(page, "reservation", shot, out, wait);
  await page.locator("article").evaluate((n) => {
    n.style.marginLeft = "460px";
  });
  const moved = await captureShot(page, "reservation-moved", shot, out, wait);
  expect(moved.target.x).toBeGreaterThan(first.target.x + 0.2);
  expect(moved.text).toBe(first.text);
  expect(moved.endAt - moved.readyAt).toBeGreaterThanOrEqual(2500);
});
