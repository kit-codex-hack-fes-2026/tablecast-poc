import { expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import {
  fixture,
  mountKiosk,
  notify,
  requests,
  TablecastSocket,
} from "./test-support/kiosk-fixture";
import { VoiceConnection } from "./voice-connection";

it.each(["ja", "en"] as const)(
  "%sの会員Popoverは短い案内と参加者をスクロールなしで表示し、背景操作とフォーカス復帰を保つ",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    await page.viewport(1180, 820);
    await mountKiosk();
    const entry = page.getByRole("button", { name: labels.kiosk_visit_tools, exact: true });
    await expect
      .element(entry.getByText(labels.customer_member_label, { exact: true }))
      .toBeVisible();
    expect(entry.element().querySelector("svg.lucide-qr-code")).not.toBeNull();
    await entry.click();
    const popover = page.getByRole("dialog", { name: labels.kiosk_visit_tools, exact: true });
    await expect.element(popover).toBeVisible();
    await expect
      .element(popover.getByRole("heading", { name: labels.customer_phone_sign_in, exact: true }))
      .toBeVisible();
    await expect
      .element(popover.getByRole("heading", { name: labels.customer_active_members, exact: true }))
      .toBeVisible();
    await expect.element(popover.getByText(labels.customer_members_empty)).toBeVisible();
    await expect
      .poll(() => popover.element().querySelector("svg title")?.textContent)
      .toBe(labels.customer_join_visit);
    await expect.element(popover.getByText(labels.customer_ipad_intro)).not.toBeInTheDocument();
    await expect
      .element(popover.getByRole("button", { name: labels.customer_resume_service }))
      .not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=dialog-content]")).toBeNull();
    expect(document.querySelector("[inert]")).toBeNull();
    await expect.poll(() => TablecastSocket.instances.length).toBe(1);
    TablecastSocket.instances[0]?.dispatchEvent(new Event("open"));
    fixture.participantNames = [
      "Alex",
      "Reo",
      "Robin",
      "Sam",
      "Jordan",
      "Taylor",
      "Casey",
      "Jamie",
      "Morgan",
    ];
    notify("customer.context-reset");
    await expect.element(popover.getByRole("button", { name: "Alex", exact: true })).toBeVisible();
    await expect.element(popover.getByText(labels.customer_members_empty)).not.toBeInTheDocument();
    await expect
      .element(entry.getByText(labels.customer_member_label, { exact: true }))
      .toBeVisible();
    expect(entry.element().querySelector("svg.lucide-qr-code")).not.toBeNull();
    await expect.element(entry).toHaveAttribute("aria-expanded", "true");
    await expect
      .poll(
        () =>
          entry.element().querySelectorAll("[data-ui=member-avatar-stack] [aria-hidden=true]")
            .length,
      )
      .toBeGreaterThanOrEqual(3);
    for (const [width, height] of [
      [1180, 820],
      [820, 1180],
      [402, 874],
      [874, 402],
    ] as const) {
      await page.viewport(width, height);
      await expect
        .poll(() => popover.element().getBoundingClientRect().right)
        .toBeLessThanOrEqual(width);
      await expect
        .poll(() => popover.element().getBoundingClientRect().bottom)
        .toBeLessThanOrEqual(height);
      for (const element of [
        popover.element(),
        ...popover.element().querySelectorAll("section,ul,nav"),
      ]) {
        expect(element.scrollHeight).toBeLessThanOrEqual(element.clientHeight + 1);
        expect(["auto", "scroll"]).not.toContain(getComputedStyle(element).overflowY);
      }
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    }
    await page.viewport(1180, 820);
    await popover.getByRole("button", { name: labels.common_next_page }).click();
    await expect
      .element(popover.getByRole("button", { name: "Jordan", exact: true }))
      .toBeVisible();
    await popover.getByRole("button", { name: labels.common_next_page }).click();
    await expect
      .element(popover.getByRole("button", { name: "Morgan", exact: true }))
      .toBeVisible();
    await expect
      .element(popover.getByRole("button", { name: labels.common_next_page }))
      .toBeDisabled();
    await page.getByRole("tab", { name: labels.kiosk_menu, exact: true }).click();
    await expect.element(popover).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(popover).not.toBeInTheDocument();
    await expect.element(entry).toHaveFocus();
    expect(requests.filter((request) => request.url.includes("/voice/start"))).toHaveLength(0);
  },
);

it("退出通知後の取得失敗とイベント上限でも以前の会員名・アイコンを復活させない", async () => {
  fixture.participantNames = ["Alex"];
  const tableFetch = globalThis.fetch;
  let fail = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (fail && new URL(request.url).pathname === "/api/table/participants")
      return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
    return tableFetch(input, init);
  });
  await mountKiosk();
  const entry = page.getByRole("button", { name: ja.kiosk_visit_tools, exact: true });
  await entry.click();
  const popover = page.getByRole("dialog", { name: ja.kiosk_visit_tools });
  await expect.element(popover.getByRole("button", { name: "Alex", exact: true })).toBeVisible();
  await expect.poll(() => TablecastSocket.instances.length).toBe(1);
  TablecastSocket.instances[0]?.dispatchEvent(new Event("open"));
  fixture.participantNames = [];
  fail = true;
  notify("customer.context-reset");
  await expect.element(popover.getByRole("alert")).toBeVisible();
  await expect.element(popover.getByText(ja.customer_members_empty)).not.toBeInTheDocument();
  await expect
    .element(popover.getByRole("button", { name: "Alex", exact: true }))
    .not.toBeInTheDocument();
  expect(entry.element().querySelector("[data-ui=member-avatar-stack]")).toBeNull();
  const afterReset = fixture.current.cursor;
  fixture.current.events = Array.from({ length: 100 }, (_, index) => ({
    cursor: afterReset + index + 1,
    kind: "table.ui" as const,
    data: {},
    storeId: fixture.current.storeId,
    tableSessionId: fixture.current.id,
    createdAt: Date.now(),
  }));
  fixture.current.cursor += 100;
  notify("table.ui");
  await expect
    .poll(() => {
      const events = fixture.client.getQueryData<{ events: { kind: string }[] }>([
        "tablecast-events",
        "table",
        fixture.current.id,
      ])?.events;
      return (
        events?.length === 100 && events.every((event) => event.kind !== "customer.context-reset")
      );
    })
    .toBe(true);
  await expect
    .element(popover.getByRole("button", { name: "Alex", exact: true }))
    .not.toBeInTheDocument();
  fail = false;
  await popover.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(popover.getByRole("alert")).not.toBeInTheDocument();
});

it("非モーダルの会員選択中も背景の音声再開は対象の再取得完了を待つ", async () => {
  const start = vi.spyOn(VoiceConnection.prototype, "start").mockResolvedValue(undefined);
  fixture.participantNames = ["Reo", "Alex"];
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  fixture.beforeRequest = async (request) => {
    if (new URL(request.url).pathname === "/api/table/customer-target") {
      arrived.resolve();
      await release.promise;
    }
  };
  try {
    await mountKiosk();
    await page.getByRole("button", { name: ja.kiosk_visit_tools, exact: true }).click();
    const popover = page.getByRole("dialog", { name: ja.kiosk_visit_tools });
    await popover.getByRole("button", { name: "Alex", exact: true }).click();
    await arrived.promise;
    const resume = page.getByRole("button", { name: ja.kiosk_voice_resume, exact: true });
    await expect.element(resume).toBeDisabled();
    expect(requests.filter((request) => request.url.includes("/voice/start"))).toHaveLength(0);
    await page.getByRole("button", { name: ja.kiosk_call_staff, exact: true }).click();
    const staff = page.getByRole("dialog", { name: ja.assistance_title });
    await expect.element(staff).toBeVisible();
    expect(start).not.toHaveBeenCalled();
    await staff.getByRole("button", { name: ja.assistance_direct, exact: true }).click();
    await expect
      .poll(
        () =>
          requests.filter((request) => new URL(request.url).pathname === "/api/table/call").length,
      )
      .toBe(1);
    expect(start).not.toHaveBeenCalled();
    release.resolve();
    await expect
      .element(popover.getByRole("button", { name: "Alex", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(resume).toBeEnabled();
  } finally {
    release.resolve();
  }
});
