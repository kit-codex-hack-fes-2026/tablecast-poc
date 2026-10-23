import { expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { m } from "../../paraglide/messages";
import { homeOptions } from "../store/home-query";
import "../../styles.css";
import { draftChoicesOptions, draftOptions } from "./menu-query";
import {
  base,
  draftId,
  fixture,
  open,
  storeId,
} from "./test-support/configuration-workflow-fixture";

it("日本語で検証後に公開内容を確認し、承認するまで公開要求を送らない", async () => {
  const locale = "ja";
  const labels = ja;
  const { screen } = await open(`${base}/changes/${draftId}`, locale);
  fixture.client.setQueryData(homeOptions(storeId).queryKey, () => ({
    storeId,
    hasProducts: false,
    hasDevices: false,
  }));
  const publish = screen.getByRole("button", { name: labels.admin_publish, exact: true });
  await expect.element(publish).toBeDisabled();
  await screen.getByRole("button", { name: labels.admin_validate, exact: true }).click();
  await expect.element(publish).toBeEnabled();
  await publish.click();
  const confirmation = screen.getByRole("dialog", {
    name: labels.workflow_publish_title,
    exact: true,
  });
  await expect.element(confirmation).toBeVisible();
  expect(fixture.requests.filter((request) => request.url.endsWith("/publish"))).toHaveLength(0);
  await confirmation.getByRole("button", { name: labels.common_cancel, exact: true }).click();
  await expect.element(publish).toHaveFocus();
  await publish.click();
  await confirmation.getByRole("button", { name: labels.admin_publish, exact: true }).click();
  await expect
    .element(screen.getByRole("link", { name: labels.workflow_view_published, exact: true }))
    .toBeVisible();
  const publications = fixture.requests.filter((request) => request.url.endsWith("/publish"));
  expect(publications).toHaveLength(1);
  expect(fixture.client.getQueryState(homeOptions(storeId).queryKey)?.isInvalidated).toBe(true);
  expect(await publications[0]?.json()).toMatchObject({
    approved: true,
    baseVersion: 1,
    expectedVersion: 3,
  });
});

it("他スタッフの公開と競合したら公開版と下書きを再取得し、古い版の再公開を止める", async () => {
  fixture.current.status = "ready";
  const { screen } = await open(`${base}/changes/${draftId}`);
  const main = screen.getByRole("main");
  const publish = main.getByRole("button", { name: ja.admin_publish, exact: true });
  await expect.element(publish).toBeEnabled();
  await publish.click();
  const confirmation = screen.getByRole("dialog", { name: ja.workflow_publish_title, exact: true });
  // 公開確認を開いた後に、他スタッフが公開版と下書きの保存版を更新する。
  fixture.publishedVersion = 2;
  fixture.current = { ...fixture.current, version: 8, status: "draft" };
  fixture.publishFailure = 409;
  await confirmation.getByRole("button", { name: ja.admin_publish, exact: true }).click();
  await expect.element(main.getByText(ja.workflow_stale, { exact: true })).toBeVisible();
  await expect.element(confirmation).not.toBeInTheDocument();
  await expect
    .element(
      main
        .getByText(m.workflow_current_short({ version: 2 }, { locale: "ja" }), {
          exact: true,
        })
        .first(),
    )
    .toBeVisible();
  expect(fixture.client.getQueryData(draftOptions(storeId, draftId).queryKey)).toMatchObject({
    version: 8,
    status: "draft",
  });
  await expect
    .element(main.getByRole("link", { name: ja.workflow_view_published, exact: true }))
    .toHaveAttribute("href", `${base}/products`);
  await expect.element(publish).toBeDisabled();
  expect(fixture.requests.filter((request) => request.url.endsWith("/publish"))).toHaveLength(1);
  expect(
    fixture.requests.filter(
      (request) => request.method === "GET" && request.url.endsWith("/catalog"),
    ),
  ).toHaveLength(2);
  expect(
    fixture.requests.filter(
      (request) => request.method === "GET" && request.url.endsWith(`/drafts/${draftId}`),
    ),
  ).toHaveLength(2);
});

it("編集開始では再開と新規を選び、再開時は下書きを増やさない", async () => {
  const { screen, router } = await open(`${base}/products`);
  await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
  const choice = screen.getByRole("dialog", { name: ja.workflow_choose_title, exact: true });
  await expect
    .element(choice.getByRole("button", { name: ja.editor_create_draft, exact: true }))
    .toBeVisible();
  await choice.getByRole("button", { name: ja.workflow_resume, exact: true }).click();
  await expect
    .poll(() => router.state.location.pathname)
    .toBe(`${base}/changes/${draftId}/products`);
  expect(fixture.requests.filter((request) => request.method === "POST")).toHaveLength(0);
});

it("版競合後の再読込は確認するまで入力を残し、承認後に最新の保存値を復元する", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  fixture.current = {
    ...fixture.current,
    version: 8,
    configuration: {
      ...fixture.current.configuration,
      products: fixture.current.configuration.products.map((item) =>
        item.id === product.id ? { ...item, price: 900 } : item,
      ),
    },
  };
  fixture.saveFailure = 409;
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  const reload = screen.getByRole("button", { name: ja.workflow_conflict_reload, exact: true });
  await reload.click();
  const confirmation = screen.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: ja.common_cancel, exact: true }).click();
  await expect.element(price).toHaveValue(777);
  await reload.click();
  await confirmation
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect.element(price).toHaveValue(900);
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(fixture.current.version).toBe(8);
});

it("未保存で別設定へ移動しようとすると入力を保護し、取り消して編集を続けられる", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const path = `${base}/changes/${draftId}/products/${product.id}`;
  const { screen, router } = await open(path);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen
    .getByRole("main")
    .getByRole("link", { name: ja.editor_products, exact: true })
    .click();
  expect(confirm).toHaveBeenCalledWith(ja.menu_leave_unsaved);
  expect(router.state.location.pathname).toBe(path);
  await expect.element(price).toHaveValue(777);
});

it("iPad縦向きでも古い公開版の公開不能理由と戻り先が見える", async () => {
  const previousViewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(768, 1024);
  try {
    fixture.current.status = "ready";
    fixture.publishedVersion = 2;
    const { screen } = await open(`${base}/changes/${draftId}`);
    await expect
      .element(screen.getByRole("button", { name: ja.admin_publish, exact: true }))
      .toBeDisabled();
    await expect.element(screen.getByText(ja.workflow_stale, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: ja.workflow_view_published, exact: true }))
      .toBeVisible();
    const header = screen.getByRole("main").element().querySelector("header");
    if (!header) throw new Error("設定のヘッダーが必要です");
    expect(header.getBoundingClientRect().height).toBeLessThan(window.innerHeight / 2);
    const publishedLink = screen
      .getByRole("link", { name: ja.workflow_view_published, exact: true })
      .element();
    publishedLink.scrollIntoView({ block: "center" });
    expect(publishedLink.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      header.getBoundingClientRect().bottom,
    );
    expect(publishedLink.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  } finally {
    await page.viewport(previousViewport.width, previousViewport.height);
  }
});

it.each([true, false])(
  "設定ヘッダーで下書きを切り替え、対象の存在=%sに応じて同じ商品か一覧へ進む",
  async (exists) => {
    const product = fixture.current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    const nextId = "tablecast-second-draft";
    const next = structuredClone(fixture.current);
    next.id = nextId;
    next.configuration.products = exists ? next.configuration.products : [];
    fixture.client.setQueryData(draftOptions(storeId, nextId).queryKey, next);
    fixture.client.setQueryData(draftChoicesOptions(storeId).queryKey, {
      pages: [
        {
          drafts: [
            {
              id: nextId,
              baseVersion: 1,
              version: 2,
              status: "draft",
              updatedAt: 4,
              sections: ["products"],
              changeCount: 2,
            },
          ],
          publishedVersion: 1,
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    const { screen, router } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    await screen
      .getByRole("region", { name: ja.workflow_context })
      .getByRole("button", { name: ja.workflow_draft_identity, exact: true })
      .click();
    await screen.getByRole("menuitem", { name: /差分 2 件/ }).click();
    await expect
      .poll(() => router.state.location.pathname)
      .toBe(`${base}/changes/${nextId}/products${exists ? `/${product.id}` : ""}`);
    expect(fixture.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  },
);

it("設定ヘッダーから公開版への切り替えを取り消すと未保存の入力と対象を保つ", async () => {
  const product = fixture.current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const path = `${base}/changes/${draftId}/products/${product.id}`;
  const { screen, router } = await open(path);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("876");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen
    .getByRole("region", { name: ja.workflow_context })
    .getByRole("button", { name: ja.workflow_draft_identity, exact: true })
    .click();
  await screen.getByRole("menuitem", { name: ja.workflow_view_published, exact: true }).click();
  expect(confirm).toHaveBeenCalledWith(ja.menu_leave_unsaved);
  expect(router.state.location.pathname).toBe(path);
  await expect.element(price).toHaveValue(876);
  expect(fixture.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
});
