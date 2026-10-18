import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { couponDefinitionSchema, pointPolicySchema } from "@tablecast/api/schema";
import type { z } from "zod";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { CouponManagement } from "./coupon-management";
import { PointPolicy } from "./point-policy";
import { couponRulesOptions } from "./coupon-query";
import { pointPolicyOptions } from "./point-query";
import { StoreShell } from "./store-shell";
import "../../styles.css";

const storeId = "tablecast-rewards-store";
const api = `/api/admin/stores/${storeId}`;
let client: QueryClient;
let initialViewport: { width: number; height: number };
let unexpected: string[];
let failRead: boolean;
let failSave: boolean;
let displaced: boolean;
let ruleCursors: (string | null)[];
let policy: Awaited<ReturnType<NonNullable<ReturnType<typeof pointPolicyOptions>["queryFn"]>>>;
let coupon: z.infer<typeof couponDefinitionSchema>;
let policyWrites: z.infer<typeof pointPolicySchema>[];
let couponWrites: z.infer<typeof couponDefinitionSchema>[];
const unavailable = () => Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
const conflict = () => Response.json({ error: { code: "STALE" } }, { status: 409 });

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
  unexpected = [];
  failRead = false;
  failSave = false;
  displaced = false;
  ruleCursors = [];
  policyWrites = [];
  couponWrites = [];
  policy = { version: 1, rules: { enabled: true, kind: "visit", points: 2, unitYen: 100 } };
  coupon = {
    id: "0adf07f9-5dc9-421d-826e-31ed385a7ac8",
    expectedVersion: 1,
    active: true,
    rules: {
      title: { ja: "会員の100円割引", en: "Member discount" },
      description: { ja: "会計から100円引きます", en: "JPY 100 off your bill" },
      imageKey: `tablecast/uploads/${"a".repeat(64)}.webp`,
      imageKind: "illustration",
      imageSource: { generated: false, description: "店舗が利用を許可した券面" },
      startsAt: Date.UTC(2026, 9, 1),
      endsAt: Date.UTC(2026, 10, 1),
      minimumYen: 0,
      discountKind: "fixed",
      discountValue: 100,
      maximumYen: 1000,
      trigger: "manual",
      threshold: 1,
    },
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (path === `${api}/points/policy`) {
      if (request.method === "GET") return failRead ? unavailable() : Response.json(policy);
      const value = pointPolicySchema.parse(await request.json());
      policyWrites.push(value);
      if (failSave) return unavailable();
      if (value.expectedVersion !== policy.version) return conflict();
      const { expectedVersion, ...rules } = value;
      policy = { version: expectedVersion + 1, rules };
      return Response.json(policy);
    }
    if (path === `${api}/coupons/rules`) {
      if (request.method === "GET") {
        if (failRead) return unavailable();
        const cursor = url.searchParams.get("beforeId");
        ruleCursors.push(cursor);
        const { expectedVersion, ...definition } = coupon;
        if (displaced && !cursor)
          return Response.json({
            rules: [
              {
                ...definition,
                id: "tablecast-newer-coupon",
                version: 1,
                rules: { ...definition.rules, title: { ja: "追加された割引", en: "New discount" } },
              },
            ],
            nextCursor: "tablecast-newer-coupon",
          });
        return Response.json({
          rules: [{ ...definition, version: expectedVersion }],
          nextCursor: null,
        });
      }
      const value = couponDefinitionSchema.parse(await request.json());
      couponWrites.push(value);
      if (failSave) return unavailable();
      if (value.expectedVersion !== coupon.expectedVersion) return conflict();
      coupon = { ...value, expectedVersion: value.expectedVersion + 1 };
      return Response.json({ id: coupon.id, version: coupon.expectedVersion });
    }
    if (path === `${api}/coupons/issued`) return Response.json({ coupons: [], nextCursor: null });
    if (path === `${api}/coupons/members`) return Response.json({ members: [], nextCursor: null });
    unexpected.push(`${request.method} ${path}`);
    return unavailable();
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(initialViewport.width, initialViewport.height);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
async function show(view: ReactNode, locale: "ja" | "en" = "ja") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    locale,
    stores: [
      {
        id: storeId,
        name: "特典設定の検証店舗",
        logo: null,
        role: "owner",
        organizationId: "tablecast-rewards-org",
      },
    ],
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const settings = createRoute({
    getParentRoute: () => store,
    path: "rewards",
    component: () => view,
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([settings])]),
    history: createMemoryHistory({ initialEntries: [`/admin/stores/${storeId}/rewards`] }),
  });
  await router.load();
  await page.viewport(1024, 900);
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
async function reloadSettings(labels = ja) {
  await page.getByRole("button", { name: labels.reward_editor_reload, exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect.element(dialog).toBeVisible();
  await dialog.getByRole("button", { name: labels.reward_editor_reload, exact: true }).click();
}
const save = () => page.getByRole("button", { name: ja.account_save, exact: true });
const points = () => page.getByRole("spinbutton", { name: ja.customer_points_rate, exact: true });
const title = () => page.getByRole("textbox", { name: ja.coupon_title_ja, exact: true });

it("ポイント方針は背景更新と取得失敗で入力と基準版を保ち、承認した再読込だけで置き換える", async () => {
  await show(<PointPolicy />);
  await points().fill("7");
  await expect.element(save()).toHaveAttribute("data-pwa-blocked", "true");
  policy = { ...policy, version: 2, rules: { ...policy.rules, points: 13 } };
  await client.invalidateQueries({ queryKey: pointPolicyOptions(storeId).queryKey });
  await expect.element(page.getByText(ja.reward_editor_conflict, { exact: true })).toBeVisible();
  await expect.element(points()).toHaveValue(7);
  failRead = true;
  await client.invalidateQueries({ queryKey: pointPolicyOptions(storeId).queryKey });
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(points()).toHaveValue(7);
  failRead = false;
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await save().click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(policyWrites).toMatchObject([{ expectedVersion: 1, points: 7 }]);
  await expect.element(points()).toHaveValue(7);
  await page.getByRole("button", { name: ja.reward_editor_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect.element(points()).toHaveValue(7);
  await reloadSettings();
  await expect.element(points()).toHaveValue(13);
  await expect.element(save()).toHaveAttribute("data-pwa-blocked", "false");
  await expect
    .element(page.getByText(ja.reward_editor_conflict, { exact: true }))
    .not.toBeInTheDocument();
});
it("ポイント方針は保存と再読込の失敗から入力を保って再試行し、自分の成功版を次の基準にする", async () => {
  await show(<PointPolicy />, "en");
  const value = page.getByRole("spinbutton", { name: en.customer_points_rate, exact: true });
  const submit = page.getByRole("button", { name: en.account_save, exact: true });
  await value.fill("8");
  failRead = true;
  await reloadSettings(en);
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(value).toHaveValue(8);
  failRead = false;
  await page.getByRole("button", { name: en.common_retry, exact: true }).click();
  await expect.element(value).toHaveValue(2);
  await value.fill("8");
  failSave = true;
  await submit.click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(value).toHaveValue(8);
  failSave = false;
  await submit.click();
  await expect.element(submit).toHaveAttribute("data-pwa-blocked", "false");
  await expect
    .element(page.getByText(en.reward_editor_conflict, { exact: true }))
    .not.toBeInTheDocument();
  await value.fill("9");
  await submit.click();
  await expect.element(submit).toHaveAttribute("data-pwa-blocked", "false");
  expect(policyWrites).toMatchObject([
    { expectedVersion: 1 },
    { expectedVersion: 1 },
    { expectedVersion: 2, points: 9 },
  ]);
});
it("クーポンの背景更新と取得失敗で入力・選択ファイル・基準版を保ち、承認した再読込でだけ取り消す", async () => {
  await show(<CouponManagement />);
  await page.getByRole("button", { name: /^会員の100円割引/ }).click();
  await title().fill("編集中の会員割引");
  await page
    .getByLabelText(ja.editor_image_replace)
    .upload(
      new File(
        [
          Uint8Array.fromBase64(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
          ),
        ],
        "tablecast-unsaved-coupon.png",
        { type: "image/png" },
      ),
    );
  coupon = {
    ...coupon,
    expectedVersion: 2,
    rules: { ...coupon.rules, title: { ...coupon.rules.title, ja: "他者が保存した割引" } },
  };
  await client.invalidateQueries({ queryKey: couponRulesOptions(storeId).queryKey });
  await expect.element(page.getByText(ja.reward_editor_conflict, { exact: true })).toBeVisible();
  await expect.element(title()).toHaveValue("編集中の会員割引");
  await expect
    .element(page.getByText("tablecast-unsaved-coupon.png", { exact: true }))
    .toBeVisible();
  await expect.element(save()).toBeDisabled();
  expect(document.querySelector('form[data-pwa-blocked="true"]')).not.toBeNull();
  failRead = true;
  await client.invalidateQueries({ queryKey: couponRulesOptions(storeId).queryKey });
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(title()).toHaveValue("編集中の会員割引");
  failRead = false;
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await page.getByRole("button", { name: ja.reward_editor_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect
    .element(page.getByText("tablecast-unsaved-coupon.png", { exact: true }))
    .toBeVisible();
  displaced = true;
  await client.invalidateQueries({ queryKey: couponRulesOptions(storeId).queryKey });
  await expect.element(title()).toHaveValue("編集中の会員割引");
  await expect
    .element(page.getByText("tablecast-unsaved-coupon.png", { exact: true }))
    .toBeVisible();
  await reloadSettings();
  await expect.element(title()).toHaveValue("他者が保存した割引");
  expect(ruleCursors).toContain("tablecast-newer-coupon");
  await expect
    .element(page.getByText("tablecast-unsaved-coupon.png", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(save()).toBeEnabled();
  await expect.element(save()).toHaveAttribute("data-pwa-blocked", "false");
  await title().fill("最新の基準から保存");
  await save().click();
  await expect.element(title()).not.toBeInTheDocument();
  expect(couponWrites).toMatchObject([
    { expectedVersion: 2, rules: { title: { ja: "最新の基準から保存" } } },
  ]);
  expect(couponWrites[0]?.rules.startsAt).toBe(Date.UTC(2026, 9, 1));
  expect(couponWrites[0]?.rules.endsAt).toBe(Date.UTC(2026, 10, 1));
});
it("クーポンは409と再読込・保存の失敗で入力を保ち、自分の保存後は最新の版で再編集する", async () => {
  await show(<CouponManagement />);
  await page.getByRole("button", { name: /^会員の100円割引/ }).click();
  await title().fill("保存をやり直す割引");
  coupon = { ...coupon, expectedVersion: 2 };
  await save().click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(title()).toHaveValue("保存をやり直す割引");
  expect(couponWrites[0]?.expectedVersion).toBe(1);
  failRead = true;
  await reloadSettings();
  await expect.element(title()).toHaveValue("保存をやり直す割引");
  failRead = false;
  await reloadSettings();
  await expect.element(title()).toHaveValue("会員の100円割引");
  await title().fill("再試行した会員割引");
  failSave = true;
  await save().click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(title()).toHaveValue("再試行した会員割引");
  failSave = false;
  await save().click();
  await expect.element(title()).not.toBeInTheDocument();
  await page.getByRole("button", { name: /^再試行した会員割引/ }).click();
  await title().fill("次の保存");
  await save().click();
  await expect.element(title()).not.toBeInTheDocument();
  expect(couponWrites.map((value) => value.expectedVersion)).toEqual([1, 2, 2, 3]);
});
