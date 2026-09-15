import { expect } from "@playwright/test";
import { z } from "zod";
import { adminStateSchema, catalogSchema, tableStateSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ trace: "off", actionTimeout: 15_000 });

for (const { locale, labels, language } of [
  { locale: "ja", labels: ja, language: "日本語" },
  { locale: "en", labels: en, language: "English" },
] as const) {
  test(`${language}でゲームを試遊・承認・公開し、卓で交代・結果発表・終了してカートへ戻る`, async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    const storeId = "tablecast-komorebi";
    const path = `/api/admin/stores/${storeId}`;
    const guestContext = await browser.newContext({
      baseURL,
      viewport: { width: 1180, height: 820 },
    });
    try {
      expect(
        (
          await page.request.post("/api/auth/sign-in/email", {
            data: { email: credentials.email, password: credentials.password },
            headers: { Origin: baseURL ?? "" },
          })
        ).status(),
      ).toBe(200);
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
      await page.getByRole("button", { name: language, exact: true }).click();
      await page.getByRole("button", { name: "tablecast-turns", exact: true }).click();
      await page.getByRole("button", { name: labels.admin_validate, exact: true }).click();
      const previewButton = page.getByRole("button", { name: labels.games_preview, exact: true });
      await expect(previewButton).toBeEnabled();
      await previewButton.click();
      const preview = page.frameLocator("iframe");
      await expect(previewButton).toBeDisabled();
      await expect(
        preview.getByRole("button", { name: locale === "ja" ? "次の人へ" : "Next player" }),
      ).toBeVisible();
      await preview
        .getByRole("button", { name: locale === "ja" ? "次の人へ" : "Next player" })
        .click();
      await preview.getByRole("button", { name: locale === "ja" ? "スキップ" : "Skip" }).click();
      await expect(
        preview.getByRole("heading", { name: locale === "ja" ? "結果発表" : "Results" }),
      ).toBeVisible();
      await page.getByRole("button", { name: labels.games_preview_confirm, exact: true }).click();
      await expect(page.locator("iframe")).toHaveCount(0);
      await page.getByRole("button", { name: labels.games_publish, exact: true }).click();
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
      await page.screenshot({ path: testInfo.outputPath(`tablecast-games-admin-${locale}.png`) });

      const store = adminStateSchema.parse(await (await page.request.get(path)).json());
      const table = store.vacantTables[0];
      if (!table) throw new Error("空卓が必要です");
      expect(
        (
          await page.request.post(`${path}/tables/open`, {
            data: { tableId: table.id, guestCount: 2, locale },
          })
        ).status(),
      ).toBe(200);
      const pairing = z
        .object({ user_code: z.string(), device_code: z.string() })
        .parse(await (await guestContext.request.post("/api/devices/request")).json());
      expect(
        (
          await page.request.post(`${path}/devices/approve`, {
            data: { userCode: pairing.user_code, tableId: table.id },
          })
        ).status(),
      ).toBe(200);
      await expect
        .poll(
          async () =>
            z.object({ ready: z.boolean() }).parse(
              await (
                await guestContext.request.post("/api/devices/poll", {
                  data: { device_code: pairing.device_code },
                })
              ).json(),
            ).ready,
        )
        .toBe(true);
      const catalogue = catalogSchema.parse(
        await (await guestContext.request.get("/api/table/catalog")).json(),
      );
      const product = catalogue.configuration.products.find(
        (item) => item.available && item.modifiers.length === 0,
      );
      if (!product) throw new Error("カート確認用の商品が必要です");
      const cart = tableStateSchema.parse(
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
      ).cart;
      const guest = await guestContext.newPage();
      await guest.goto("/");
      await guest.getByRole("button", { name: labels.games_title, exact: true }).click();
      await guest.getByRole("button", { name: labels.games_start, exact: true }).click();
      const playing = guest.frameLocator("iframe");
      await playing
        .getByRole("button", { name: locale === "ja" ? "次の人へ" : "Next player" })
        .click();
      await expect(playing.getByRole("heading", { name: "2", exact: true })).toBeVisible();
      await playing.getByRole("button", { name: locale === "ja" ? "スキップ" : "Skip" }).click();
      await expect(
        playing.getByRole("heading", { name: locale === "ja" ? "結果発表" : "Results" }),
      ).toBeVisible();
      await guest.screenshot({ path: testInfo.outputPath(`tablecast-games-guest-${locale}.png`) });
      await guest.route("**/api/table/games/runs/*", (route) => route.abort());
      await expect(guest.locator("iframe")).toHaveCount(0);
      await expect(guest.getByText(labels.games_unavailable, { exact: true })).toBeVisible();
      await guest.unroute("**/api/table/games/runs/*");
      await expect(
        playing.getByRole("heading", { name: locale === "ja" ? "結果発表" : "Results" }),
      ).toBeVisible();

      await playing
        .getByRole("button", { name: locale === "ja" ? "終了" : "Finish", exact: true })
        .click();
      await expect(guest.getByRole("dialog")).toHaveCount(0);
      await guest.getByRole("tab", { name: new RegExp(labels.kiosk_cart) }).click();
      await expect(
        guest.getByText(product.text[locale].displayName, { exact: true }).first(),
      ).toBeVisible();
      expect(
        tableStateSchema.parse(await (await guestContext.request.get("/api/table")).json()).cart,
      ).toEqual(cart);
      await guest.getByRole("button", { name: labels.games_title, exact: true }).click();
      const release = Promise.withResolvers<void>();
      await guest.route("**/api/table/games/tablecast-turns/start", async (route) => {
        await release.promise;
        await route.continue();
      });
      const started = guest.waitForResponse((response) =>
        response.url().endsWith("/games/tablecast-turns/start"),
      );
      await guest.getByRole("button", { name: labels.games_start, exact: true }).click();
      await guest.getByRole("button", { name: labels.games_return, exact: true }).click();
      release.resolve();
      const delayed = z.object({ id: z.uuid() }).parse(await (await started).json());
      await expect
        .poll(async () =>
          (await guestContext.request.get(`/api/table/games/runs/${delayed.id}`)).status(),
        )
        .toBe(409);
      await guest.unroute("**/api/table/games/tablecast-turns/start");
      await guest.getByRole("button", { name: labels.games_title, exact: true }).click();
      await expect(guest.locator("iframe")).toHaveCount(0);
      await guest.getByRole("button", { name: labels.games_start, exact: true }).click();
      await expect(guest.locator("iframe")).toHaveCount(1);
      expect(
        (
          await page.request.post(`${path}/games/tablecast-turns/disable`, {
            data: { expectedRevision: 1 },
          })
        ).status(),
      ).toBe(200);
      await expect(guest.locator("iframe")).toHaveCount(0);
      await expect(guest.getByText(labels.games_unavailable, { exact: true })).toBeVisible();
      await guest.getByRole("button", { name: labels.games_return, exact: true }).click();
      expect(
        tableStateSchema.parse(await (await guestContext.request.get("/api/table")).json()).cart,
      ).toEqual(cart);
    } finally {
      await guestContext.close();
    }
  });
}
