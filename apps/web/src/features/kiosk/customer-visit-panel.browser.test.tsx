import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import {
  fixture,
  mountKiosk,
  notify,
  requests,
  TablecastSocket,
} from "./test-support/kiosk-fixture";

it.each(["ja", "en"] as const)(
  "%sで初めての客へ登録・参加・券申請を案内し、途中参加後は明示操作で音声を再開する",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    fixture.current.locale = locale;
    await page.viewport(1180, 820);
    await mountKiosk();
    const entry = page.getByRole("button", { name: new RegExp(`^${labels.kiosk_visit_tools}`) });
    await expect.element(entry).toBeVisible();
    expect(entry.element().textContent).toContain(labels.kiosk_visit_tools);
    await entry.click();
    const dialog = page.getByRole("dialog", { name: labels.kiosk_visit_tools });
    await expect.element(dialog).toBeVisible();
    for (const text of [
      labels.customer_step_scan,
      labels.customer_step_register,
      labels.customer_step_join,
      labels.customer_step_coupon,
    ])
      await expect.element(dialog.getByText(text, { exact: true })).toBeVisible();
    await expect.element(dialog.getByText(labels.customer_waiting_phone)).toBeVisible();
    await expect
      .element(dialog.getByRole("button", { name: labels.customer_resume_service }))
      .not.toBeInTheDocument();
    await expect
      .poll(() => dialog.element().querySelector("svg title")?.textContent)
      .toBe(labels.customer_join_visit);
    await Promise.all(
      dialog
        .element()
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
    await page.screenshot({ path: `../../../test-results/tablecast-member-ipad-${locale}.png` });
    for (const [width, height] of [
      [820, 1180],
      [402, 874],
    ] as const) {
      await page.viewport(width, height);
      expect(dialog.element().getBoundingClientRect().right).toBeLessThanOrEqual(width);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    }
    await page.viewport(1180, 820);
    await expect.poll(() => TablecastSocket.instances.length).toBe(1);
    TablecastSocket.instances[0]?.dispatchEvent(new Event("open"));
    fixture.participantNames = ["Alex"];
    notify("customer.context-reset");
    await expect.element(dialog.getByRole("button", { name: "Alex", exact: true })).toBeVisible();
    await expect
      .element(dialog.getByText(labels.customer_table_joined, { exact: true }))
      .toBeVisible();
    expect(requests.filter((request) => request.url.includes("/voice/start"))).toHaveLength(0);
    await page.screenshot({ path: `../../../test-results/tablecast-member-joined-${locale}.png` });
    const audio = new AudioContext();
    const stream = audio.createMediaStreamDestination().stream;
    try {
      vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
      await dialog.getByRole("button", { name: labels.customer_resume_service }).click();
      await expect.element(dialog).not.toBeInTheDocument();
      await expect
        .poll(() => requests.filter((request) => request.url.includes("/voice/start")).length)
        .toBe(1);
      await expect
        .element(page.getByRole("button", { name: labels.kiosk_voice_retry, exact: true }))
        .toBeVisible();
    } finally {
      stream.getTracks().forEach((track) => track.stop());
      await audio.close();
    }
  },
);

it("退出通知後の参加者再取得が失敗しても以前の名前と再開操作を残さない", async () => {
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
  await page.getByRole("button", { name: new RegExp(`^${ja.kiosk_visit_tools}`) }).click();
  const dialog = page.getByRole("dialog", { name: ja.kiosk_visit_tools });
  await expect.element(dialog.getByRole("button", { name: "Alex", exact: true })).toBeVisible();
  await expect.poll(() => TablecastSocket.instances.length).toBe(1);
  TablecastSocket.instances[0]?.dispatchEvent(new Event("open"));
  fixture.participantNames = [];
  fail = true;
  notify("customer.context-reset");
  await expect.element(dialog.getByRole("alert")).toBeVisible();
  await expect
    .element(dialog.getByRole("button", { name: "Alex", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByText(ja.customer_table_joined, { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByRole("button", { name: ja.customer_resume_service }))
    .not.toBeInTheDocument();
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
    .element(dialog.getByRole("button", { name: "Alex", exact: true }))
    .not.toBeInTheDocument();
  fail = false;
  await dialog.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(dialog.getByText(ja.customer_waiting_phone)).toBeVisible();
});

it("接客対象の変更と新しい参加者取得が完了するまで音声を再開できない", async () => {
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
    await page.getByRole("button", { name: new RegExp(`^${ja.kiosk_visit_tools}`) }).click();
    const dialog = page.getByRole("dialog", { name: ja.kiosk_visit_tools });
    await dialog.getByRole("button", { name: "Alex", exact: true }).click();
    await arrived.promise;
    const resume = dialog.getByRole("button", { name: ja.customer_resume_service });
    await expect.element(resume).toBeDisabled();
    expect(requests.filter((request) => request.url.includes("/voice/start"))).toHaveLength(0);
    release.resolve();
    await expect
      .element(dialog.getByRole("button", { name: "Alex", exact: true }))
      .toHaveAttribute("aria-pressed", "true");
    await expect.element(resume).toBeEnabled();
  } finally {
    release.resolve();
  }
});
