import { expect, test } from "@playwright/test";
import {
  historyPageSchema,
  sessionEventsPageSchema,
  tableStateSchema,
  type TableEvent,
} from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

test.use({ trace: "off", actionTimeout: 15_000 });

for (const { language, locale, labels, nextLabels, nextLanguage } of [
  { language: "日本語", locale: "ja", labels: ja, nextLabels: en, nextLanguage: "English" },
  { language: "English", locale: "en", labels: en, nextLabels: ja, nextLanguage: "日本語" },
] as const) {
  test(`${language === "English" ? "英語" : language}の来店履歴を読み取り、古いログと注文原文を保ち店舗切替で混在させない`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const storeId = "tablecast-komorebi";
    const base = `/api/admin/stores/${storeId}`;
    const headers = { Origin: baseURL ?? "" };
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: credentials,
    });
    expect(login.status()).toBe(200);
    try {
      const initialResponse = await page.request.get(`${base}/history?limit=100`);
      expect(initialResponse.status()).toBe(200);
      const initial = historyPageSchema.parse(await initialResponse.json());
      const target = initial.sessions.find((session) => session.bill.orderedTotal > 0);
      if (!target) throw new Error("注文のある既存の閉卓来店が必要です");
      const detailResponse = await page.request.get(`${base}/tables/${target.id}`);
      expect(detailResponse.status()).toBe(200);
      const detail = tableStateSchema.parse(await detailResponse.json());
      expect(detail.status).toBe("closed");
      expect(detail.orders.length).toBeGreaterThan(0);
      const eventPath = `${base}/tables/${target.id}/events`;
      const expectedEvents: TableEvent[] = [];
      let before: number | null = null;
      do {
        const query = new URLSearchParams({ limit: "100" });
        if (before !== null) query.set("before", String(before));
        const response = await page.request.get(`${eventPath}?${query}`);
        expect(response.status()).toBe(200);
        const result = sessionEventsPageSchema.parse(await response.json());
        expectedEvents.unshift(...result.events);
        if (before !== null && result.nextBefore !== null)
          expect(result.nextBefore).toBeLessThan(before);
        before = result.nextBefore;
      } while (before !== null);
      expect(expectedEvents.length).toBeGreaterThan(2);

      // 応答を偽らず、実APIのページサイズだけを短縮してbeforeの配線を確認する。
      const eventRequests: (string | null)[] = [];
      const historyRequests: URL[] = [];
      await page.route(
        /\/api\/admin\/stores\/[^/]+\/(?:history|tables\/[^/]+\/events)(?:\?.*)?$/,
        async (route) => {
          const url = new URL(route.request().url());
          url.searchParams.set("limit", "2");
          if (url.pathname === eventPath) eventRequests.push(url.searchParams.get("before"));
          if (url.pathname.endsWith("/history")) historyRequests.push(url);
          await route.continue({ url: url.toString() });
        },
      );
      await page.goto(`/admin/stores/${storeId}/floor`);
      await page.getByRole("button", { name: language, exact: true }).click();
      const firstHistoryResponse = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `${base}/history` && !url.searchParams.has("beforeId") && response.ok()
        );
      });
      await page.getByRole("link", { name: labels.admin_history, exact: true }).click();
      const firstHistoryPage = historyPageSchema.parse(await (await firstHistoryResponse).json());
      const history = page.getByRole("main");
      await expect(history.locator("tbody tr")).toHaveCount(Math.min(2, initial.sessions.length));
      const moreVisits = page.getByRole("button", { name: labels.admin_more_visits, exact: true });
      if (initial.sessions.length > 2) {
        await moreVisits.click();
        await expect(history.locator("tbody tr")).toHaveCount(Math.min(4, initial.sessions.length));
        const secondRequest = historyRequests.find((url) => url.searchParams.has("beforeId"));
        expect(secondRequest?.searchParams.get("beforeId")).toBe(firstHistoryPage.nextCursor?.id);
        expect(secondRequest?.searchParams.get("beforeClosedAt")).toBe(
          String(firstHistoryPage.nextCursor?.closedAt),
        );
      }
      const row = history.locator(`[data-row-id="${target.id}"]`);
      const targetIndex = initial.sessions.findIndex((session) => session.id === target.id);
      for (let loaded = 4; loaded <= targetIndex; loaded += 2) {
        await moreVisits.click();
        await expect(history.locator("tbody tr")).toHaveCount(
          Math.min(loaded + 2, initial.sessions.length),
        );
      }
      const displayedIds = await history
        .locator("tbody tr")
        .evaluateAll((rows) => rows.map((item) => item.getAttribute("data-row-id")));
      expect(displayedIds).toEqual(
        initial.sessions.slice(0, displayedIds.length).map((session) => session.id),
      );
      const dates = await page.evaluate(
        ({ startedAt, closedAt, amount, selectedLocale }) => {
          const displayLocale = selectedLocale === "ja" ? "ja-JP" : "en-GB";
          const date = new Intl.DateTimeFormat(displayLocale, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Tokyo",
          });
          return {
            started: date.format(startedAt),
            closed: date.format(closedAt),
            total: new Intl.NumberFormat(displayLocale, {
              style: "currency",
              currency: "JPY",
              maximumFractionDigits: 0,
            }).format(amount),
          };
        },
        {
          startedAt: target.openedAt,
          closedAt: target.closedAt,
          amount: target.bill.orderedTotal + target.bill.adjustmentTotal + target.bill.planTotal,
          selectedLocale: locale,
        },
      );
      await expect(row).toContainText(dates.started);
      await expect(row).toContainText(dates.closed);
      await expect(row).toContainText(dates.total);
      await page.screenshot({ path: testInfo.outputPath("tablecast-history-list.png") });
      await row.getByRole("button", { name: labels.admin_details, exact: true }).click();
      const detailPage = page.getByRole("main");
      await expect(page).toHaveURL(new RegExp(`/visits/${target.id}`));
      await page.reload();
      await expect(detailPage).toBeVisible();
      await expect(
        detailPage.getByRole("button", { name: labels.admin_close_session, exact: true }),
      ).toHaveCount(0);
      await expect(
        detailPage.getByRole("button", { name: labels.admin_acknowledge, exact: true }),
      ).toHaveCount(0);
      await detailPage.getByRole("tab", { name: labels.admin_orders, exact: true }).click();
      await expect(detailPage.locator("[data-ui='order-card']")).toHaveCount(detail.orders.length);
      for (const [index, order] of detail.orders.entries()) {
        const card = detailPage.locator("[data-ui='order-card']").nth(index);
        for (const line of order.snapshot.lines) {
          await expect(card).toContainText(line.name[locale]);
          for (const option of line.options) await expect(card).toContainText(option.name[locale]);
        }
        await expect(card.getByRole("button")).toHaveCount(0);
      }
      await detailPage.screenshot({ path: testInfo.outputPath("tablecast-history-orders.png") });
      await detailPage.getByRole("tab", { name: labels.admin_payments, exact: true }).click();
      await expect(detailPage.locator("[data-ui='bill-summary']")).toBeVisible();
      await expect(detailPage.locator("form, input, textarea, select")).toHaveCount(0);

      const latestPage = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.pathname === eventPath && !url.searchParams.has("before") && response.ok();
      });
      await detailPage.getByRole("tab", { name: labels.admin_logs, exact: true }).click();
      let eventPage = sessionEventsPageSchema.parse(await (await latestPage).json());
      await expect(detailPage.locator("[data-event-cursor]")).toHaveCount(eventPage.events.length);
      const expectedBefore: (string | null)[] = [null];
      let shown = eventPage.events.length;
      while (eventPage.nextBefore !== null) {
        const expectedCursor = String(eventPage.nextBefore);
        expectedBefore.push(expectedCursor);
        const previousPage = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === eventPath &&
            url.searchParams.get("before") === expectedCursor &&
            response.ok()
          );
        });
        await detailPage
          .getByRole("button", { name: labels.admin_older_events, exact: true })
          .click();
        eventPage = sessionEventsPageSchema.parse(await (await previousPage).json());
        shown += eventPage.events.length;
        await expect(detailPage.locator("[data-event-cursor]")).toHaveCount(shown);
      }
      expect([...new Set(eventRequests)]).toEqual(expectedBefore);
      const cursors = await detailPage
        .locator("[data-event-cursor]")
        .evaluateAll((events) =>
          events.map((item) => Number(item.getAttribute("data-event-cursor"))),
        );
      expect(cursors).toEqual(expectedEvents.map((event) => event.cursor));
      expect(new Set(cursors).size).toBe(cursors.length);
      await expect(
        detailPage.getByRole("button", { name: labels.admin_older_events, exact: true }),
      ).toHaveCount(0);
      const timestamps = await detailPage
        .locator("[data-ui='activity-log'] time")
        .evaluateAll((times) => times.map((item) => item.getAttribute("datetime")));
      expect(timestamps).toEqual(
        expectedEvents.map((event) => new Date(event.createdAt).toISOString()),
      );
      await detailPage.screenshot({ path: testInfo.outputPath("tablecast-history-activity.png") });
      await page.goto(`/admin/stores/${storeId}/visits`);

      // 言語と店舗を切り替え、以前の来店IDやページcursorを引き継がない。
      await page.getByRole("button", { name: nextLanguage, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: nextLabels.admin_history, exact: true }),
      ).toBeVisible();
      const otherStoreId = "tablecast-akari";
      const otherResponse = await page.request.get(
        `/api/admin/stores/${otherStoreId}/history?limit=2`,
      );
      expect(otherResponse.status()).toBe(200);
      const other = historyPageSchema.parse(await otherResponse.json());
      expect(other.sessions.length).toBeGreaterThan(0);
      await page.getByRole("combobox", { name: nextLabels.stores_title, exact: true }).click();
      await page.getByRole("option", { name: /あかり|Akari/ }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/stores/${otherStoreId}/floor`));
      await page.getByRole("link", { name: nextLabels.admin_history, exact: true }).click();
      const otherHistory = page.getByRole("main");
      await expect(otherHistory.locator("tbody tr")).toHaveCount(other.sessions.length);
      await expect
        .poll(() =>
          otherHistory
            .locator("tbody tr")
            .evaluateAll((rows) => rows.map((item) => item.getAttribute("data-row-id"))),
        )
        .toEqual(other.sessions.map((session) => session.id));
      await expect(page.locator(`[data-row-id="${target.id}"]`)).toHaveCount(0);
      const otherRequest = historyRequests.find((url) => url.pathname.includes(otherStoreId));
      expect(otherRequest?.searchParams.has("beforeId")).toBe(false);
      expect(otherRequest?.searchParams.has("beforeClosedAt")).toBe(false);
    } finally {
      const logout = await page.request.post("/api/auth/sign-out", { headers, data: {} });
      expect(logout.status()).toBe(200);
    }
  });
}
