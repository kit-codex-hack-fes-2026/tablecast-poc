import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  gameStateSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice, signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", actionTimeout: 15_000, serviceWorkers: "block" });

const locale = "ja";
const labels = ja;
const language = "日本語";
test(`${language}でゲームを試遊・承認・公開し、卓の実状態を保存して終了後にカートへ戻る`, async ({
  page,
  browser,
  baseURL,
}) => {
  const storeId = "tablecast-komorebi";
  const path = `/api/admin/stores/${storeId}`;
  const guestContext = await browser.newContext({
    baseURL,
    viewport: { width: 1180, height: 820 },
    // 公開・開始・終了を実HTTPへ接続する。
    serviceWorkers: "block",
  });
  try {
    await signInStaff(page.request, baseURL);
    const registered = await page.request.post(`${path}/games`, {
      data: {
        gameId: "tablecast-turns",
        package: {
          manifest: {
            apiVersion: 1,
            name: { ja: "順番ゲーム", en: "Taking turns" },
            description: { ja: "二人で順番に遊びます", en: "Take turns together" },
            rules: {
              ja: "順番に進み、最後に結果を見ます。スキップできます。",
              en: "Take turns and see the result. You can skip a turn.",
            },
            minPlayers: 2,
            maxPlayers: 4,
            capabilities: ["state"],
          },
          html: '<h1 id="turn"></h1><button id="next"></button><button id="skip"></button><button id="finish"></button>',
          css: "body { font: 22px system-ui; padding: 32px; } button { min-height: 48px; padding: 12px 24px; margin: 8px; }",
          javascript: `tablecast.ready.then(({locale, players, state}) => {
            const text = locale === "ja" ? {next:"次の人へ", skip:"スキップ", finish:"終了", result:"結果発表"} : {next:"Next player", skip:"Skip", finish:"Finish", result:"Results"};
            const heading = document.getElementById("turn"), next = document.getElementById("next"), skip = document.getElementById("skip"), finish = document.getElementById("finish");
            let turn = Number(state.turn ?? 1); heading.textContent = turn > players ? text.result : String(turn); next.textContent = text.next; skip.textContent = text.skip; finish.textContent = text.finish;
            const advance = async () => { turn++; await tablecast.save({turn}); heading.textContent = turn > players ? text.result : String(turn); next.disabled = skip.disabled = turn > players; };
            next.onclick = skip.onclick = advance; finish.onclick = () => tablecast.exit();
          });`,
        },
      },
    });
    expect(registered.status()).toBe(200);
    const version = z.object({ versionId: z.uuid() }).parse(await registered.json());
    await page.goto(`/admin/stores/${storeId}/games`);
    const admin = page.getByRole("main");
    await admin.getByRole("button", { name: "順番ゲーム", exact: true }).click();
    await admin.getByRole("button", { name: labels.admin_validate, exact: true }).click();
    const previewButton = admin.getByRole("button", { name: labels.games_preview, exact: true });
    await expect(previewButton).toBeEnabled();
    await previewButton.click();
    const previewFrame = admin.getByTitle("順番ゲーム", { exact: true });
    const preview = previewFrame.contentFrame();
    await expect(previewButton).toBeDisabled();
    await expect(preview.getByRole("heading", { name: "1", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: labels.games_preview_confirm, exact: true }).click();
    await expect(previewFrame).toHaveCount(0);
    await admin.getByRole("button", { name: labels.games_publish, exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: labels.games_publish, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: labels.games_disable, exact: true }),
    ).toBeVisible();
    const publication = z
      .object({ activeVersionId: z.uuid() })
      .parse(await (await page.request.get(`${path}/games/tablecast-turns`)).json());
    expect(publication.activeVersionId).toBe(version.versionId);

    const store = adminStateSchema.parse(await (await page.request.get(path)).json());
    const table = store.vacantTables.find((item) => item.name === "T10");
    if (!table) throw new Error("専用fixtureのT10が空席ではありません");
    expect(
      (
        await page.request.post(`${path}/tables/open`, {
          data: { tableId: table.id, guestCount: 2, locale },
        })
      ).status(),
    ).toBe(200);
    await approveGuestDevice(guestContext.request, page.request, {
      origin: baseURL,
      storeId,
      tableId: table.id,
    });
    const catalogue = catalogSchema.parse(
      await (await guestContext.request.get("/api/table/catalog")).json(),
    );
    const product = catalogue.configuration.products.find(
      (item) => item.available && item.modifiers.length === 0,
    );
    if (!product) throw new Error("カート確認用の商品が必要です");
    tableStateSchema.parse(
      await (
        await guestContext.request.put("/api/table/cart", {
          data: {
            expectedVersion: 0,
            lines: [
              { id: "tablecast-game-cart", productId: product.id, quantity: 2, selections: [] },
            ],
          },
        })
      ).json(),
    );
    const guest = await guestContext.newPage();
    await guest.bringToFront();
    await guest.goto("/");
    await guest.getByRole("button", { name: labels.games_title, exact: true }).click();
    const gameDialog = guest.getByRole("dialog", { name: labels.games_title, exact: true });
    const started = guest.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/table/games/tablecast-turns/start" &&
        response.request().method() === "POST",
    );
    await gameDialog.getByRole("button", { name: labels.games_start, exact: true }).click();
    const startResponse = await started;
    expect(startResponse.ok()).toBe(true);
    const run = z.object({ id: z.string() }).parse(await startResponse.json());
    const playing = gameDialog.getByTitle("順番ゲーム", { exact: true }).contentFrame();
    await expect(playing.getByRole("heading", { name: "1", exact: true })).toBeVisible();
    await playing.getByRole("button", { name: "次の人へ", exact: true }).click();
    await expect(playing.getByRole("heading", { name: "2", exact: true })).toBeVisible();
    const saved = z
      .object({ state: gameStateSchema, revision: z.number() })
      .parse(await (await guest.request.get(`/api/table/games/runs/${run.id}`)).json());
    expect(saved).toMatchObject({ state: { turn: 2 }, revision: 1 });
    const ended = guest.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/table/games/runs/${run.id}/end` &&
        response.request().method() === "POST",
    );
    await playing.getByRole("button", { name: "終了", exact: true }).click();
    expect((await ended).ok()).toBe(true);
    await expect(gameDialog).toHaveCount(0);
    expect((await guest.request.get(`/api/table/games/runs/${run.id}`)).status()).toBe(409);
    const cartTab = guest.getByRole("tab", { name: new RegExp(`^${labels.kiosk_cart}`) });
    await cartTab.click();
    await expect(cartTab).toHaveAttribute("aria-selected", "true");
    await expect(
      guest.getByRole("tabpanel").getByText(product.text[locale].displayName, { exact: true }),
    ).toBeVisible();
    const after = tableStateSchema.parse(await (await guest.request.get("/api/table")).json());
    expect(after.cart.lines).toMatchObject([
      { id: "tablecast-game-cart", productId: product.id, quantity: 2 },
    ]);
  } finally {
    await guestContext.close();
  }
});
