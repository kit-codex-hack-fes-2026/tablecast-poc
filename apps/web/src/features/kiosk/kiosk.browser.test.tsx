import { type TableState } from "@tablecast/api/schema";
import { expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import "../../styles.css";
import { fixtureValue } from "../../test-support/fixture-value";
import {
  cartWrites,
  fixture,
  mountKiosk,
  notify,
  orderPanel,
  orderWrites,
  requests,
  TablecastSocket,
} from "./test-support/kiosk-fixture";

it("未充足行の修正は競合後も選択を保持し、再送でも同じ行だけを更新する", async () => {
  await page.viewport(1280, 1000);
  const conditional = structuredClone(product);
  fixtureValue(conditional.modifiers[0]).kind = "multiple";
  fixtureValue(conditional.modifiers[0]).min = 0;
  fixtureValue(conditional.modifiers[0]).max = 2;
  const [first, required] = fixtureValue(conditional.modifiers[0]).options;
  if (!first || !required) throw new Error("条件付き選択肢が必要です");
  first.conditions = {
    version: 2,
    requires: { kind: "option", optionId: required.id },
    excludes: null,
  };
  fixture.catalogResponse = Response.json({
    ...catalog,
    configuration: { ...catalog.configuration, products: [conditional] },
  });
  const line = fixture.current.cart.lines[0];
  if (!line) throw new Error("未充足行が必要です");
  line.selections = [{ optionId: first.id, quantity: 1 }];
  line.conditionIssues = [{ optionId: first.id, relation: "requires" }];
  fixture.current.cart.complete = false;
  fixture.savedCart = {
    ...structuredClone(fixture.current.cart),
    version: fixture.current.cart.version + 1,
    complete: true,
    lines: [
      {
        ...line,
        conditionIssues: [],
        selections: [...line.selections, { optionId: required.id, quantity: 1 }],
      },
    ],
  };
  await mountKiosk();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: ja.kiosk_edit, exact: true }).click();
  const detail = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  const choice = detail.getByRole("checkbox", { name: required.text.ja.displayName, exact: true });
  await choice.click();
  fixture.cartFailure = 409;
  await detail.getByRole("button", { name: ja.common_update, exact: true }).click();
  await expect.element(detail.getByRole("alert")).toBeVisible();
  await expect.element(choice).toBeChecked();
  expect(cartWrites[0]?.lines[0]?.selections).toEqual(
    fixtureValue(fixture.savedCart.lines[0]).selections,
  );
  expect(fixture.current.cart.complete).toBe(false);
  fixture.cartFailure = 0;
  await detail.getByRole("button", { name: ja.common_update, exact: true }).click();
  await expect.element(detail).not.toBeInTheDocument();
  expect(cartWrites).toEqual(
    [1, 2].map(() => ({
      expectedVersion: table.cart.version,
      dismissProductId: product.id,
      lines: [
        {
          id: line.id,
          productId: product.id,
          quantity: 1,
          selections: fixtureValue(fixture.savedCart.lines[0]).selections,
        },
      ],
    })),
  );
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
    .toBeEnabled();
});

it("確認の期限が失効したら確定操作を閉じる", async () => {
  await page.viewport(1280, 1000);
  await mountKiosk();
  const review = page.getByRole("button", { name: ja.kiosk_review, exact: true });
  await expect.element(review).toBeEnabled();
  fixture.confirmationDuration = 2000;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
  try {
    await review.click();
    await vi.advanceTimersByTimeAsync(0);
    const confirmation = page.getByRole("region", { name: ja.kiosk_review_title, exact: true });
    await expect.element(confirmation).toBeVisible();
    // APIの期限を本番effectで観測し、RAF・setInterval・MessageChannelは置き換えない。
    await vi.advanceTimersByTimeAsync(fixture.confirmationDuration - 1);
    await expect.element(confirmation).toBeVisible();
    await vi.advanceTimersByTimeAsync(1);
    await expect.element(confirmation).not.toBeInTheDocument();
    expect(requests.some((request) => new URL(request.url).pathname === "/api/table/orders")).toBe(
      false,
    );
  } finally {
    vi.useRealTimers();
  }
});

it.each(["カート版", "公開版"] as const)("確認の%sが失効したら確定操作を閉じる", async (reason) => {
  await page.viewport(1280, 1000);
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  const confirmation = page.getByRole("region", { name: ja.kiosk_review_title, exact: true });
  await expect.element(confirmation).toBeVisible();
  if (reason === "カート版") fixture.current.cart.version += 1;
  else {
    fixture.current.configVersion += 1;
    if (fixture.current.snapshot) fixture.current.snapshot.status = "invalid";
    fixture.catalogResponse = Response.json({ ...catalog, version: fixture.current.configVersion });
  }
  notify(reason === "公開版" ? "configuration.published" : "cart.updated");
  await expect.element(confirmation).not.toBeInTheDocument();
  expect(requests.some((request) => new URL(request.url).pathname === "/api/table/orders")).toBe(
    false,
  );
});

it("公開通知で開いた商品を閉じて新価格を取得し、同じ通知でもカート行を重複しない", async () => {
  await page.viewport(1280, 1000);
  fixture.current.uiSection = "menu";
  await mountKiosk();
  await page.getByRole("button", { name: new RegExp(product.text.ja.displayName) }).click();
  const detail = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  await expect.element(detail).toBeVisible();
  fixture.current.configVersion += 1;
  fixture.catalogResponse = Response.json({
    ...catalog,
    version: fixture.current.configVersion,
    configuration: { ...catalog.configuration, products: [{ ...product, price: 980 }] },
  });
  notify("configuration.published");
  await expect.element(detail).not.toBeInTheDocument();
  const card = page.getByRole("button", { name: new RegExp(product.text.ja.displayName) });
  await expect.element(card).toMatchTextContent("980");
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
  const socket = TablecastSocket.instances.at(-1);
  if (!socket) throw new Error("卓の通知接続がありません");
  socket.dispatchEvent(new MessageEvent("message", { data: "changed" }));
  await expect
    .element(
      page
        .getByRole("tabpanel")
        .getByText(fixtureValue(fixture.current.cart.lines[0]).name.ja, { exact: true }),
    )
    .toBeVisible();
  expect(fixture.client.getQueryData<TableState>(["tablecast-table"])?.cart.lines).toHaveLength(1);
});

it("注文操作は確認から修正・明示確定へ一箇所で切り替わる", async () => {
  await page.viewport(1024, 768);
  await mountKiosk();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  await expect.element(page.getByRole("region", { name: ja.kiosk_review_title })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_review, exact: true }))
    .not.toBeInTheDocument();
  expect(requests.filter((request) => request.url.endsWith("/table/orders"))).toHaveLength(0);
  await page.getByRole("button", { name: ja.kiosk_edit, exact: true }).click();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  const confirm = page.getByRole("button", { name: ja.kiosk_confirm, exact: true });
  await expect.element(confirm).toBeEnabled();
  confirm.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByText(ja.kiosk_ordered, { exact: true })).toBeVisible();
  expect(requests.filter((request) => request.url.endsWith("/table/orders"))).toHaveLength(1);
  expect(fixture.current.cart.lines).toHaveLength(0);
  expect(orderWrites).toHaveLength(1);
  expect(orderWrites[0]?.snapshotId).toBe("tablecast-confirmation");
  expect(orderWrites[0]?.approved).toBe(true);
  expect(orderWrites[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
});

it("注文ペインの比率をCookieから復元し、縦横の切替でもタブと音声停止を保持する", async () => {
  await page.viewport(1024, 768);
  const screen = await mountKiosk();
  const handle = page.getByRole("separator", { name: ja.kiosk_resize_panes });
  await expect.element(handle).toBeVisible();
  const initial = orderPanel()?.getBoundingClientRect().width ?? 0;
  handle.element().focus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect
    .poll(() => orderPanel()?.getBoundingClientRect().width ?? 0)
    .toBeGreaterThan(initial + 10);
  const adjusted = orderPanel()?.getBoundingClientRect().width ?? 0;
  await expect.poll(() => document.cookie).toContain("tablecast-layout-");
  await page.viewport(390, 844);
  await expect.element(handle).toHaveAttribute("aria-orientation", "horizontal");
  const initialHeight = orderPanel()?.getBoundingClientRect().height ?? 0;
  handle.element().focus();
  await userEvent.keyboard("{ArrowDown}");
  await expect
    .poll(() => orderPanel()?.getBoundingClientRect().height ?? 0)
    .toBeLessThan(initialHeight - 10);
  await expect
    .element(page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }))
    .toHaveAttribute("aria-selected", "true");
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }))
    .toBeVisible();
  await page.viewport(1024, 768);
  await expect.element(handle).toHaveAttribute("aria-orientation", "vertical");
  const desktop = orderPanel()?.getBoundingClientRect().width ?? adjusted;
  await screen.unmount();
  await mountKiosk();
  await expect
    .poll(() => Math.abs((orderPanel()?.getBoundingClientRect().width ?? 0) - desktop))
    .toBeLessThan(2);
});

it("会計依頼後は操作を依頼済みの表示へ替え、画面を戻しても重複依頼しない", async () => {
  await page.viewport(390, 844);
  await mountKiosk();
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_orders_bill}`) }).click();
  await page.getByRole("button", { name: ja.kiosk_bill_request, exact: true }).click();
  await expect
    .element(page.getByRole("status").filter({ hasText: ja.kiosk_bill_requested }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_bill_request, exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("tab", { name: ja.kiosk_menu, exact: true }).click();
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_orders_bill}`) }).click();
  await expect
    .element(page.getByRole("status").filter({ hasText: ja.kiosk_bill_requested }))
    .toBeVisible();
  expect(requests.filter((request) => request.url.endsWith("/table/bill/request"))).toHaveLength(1);
});
