import type { ReactNode } from "react";
import { couponDefinitionSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { CouponRuleForm } from "./coupon-rule-form";
import { PointVisit } from "./point-visit";
import { CouponVisit } from "./coupon-visit";
import "../../styles.css";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});
async function show(view: ReactNode) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const root = createRootRoute({ component: () => <main>{view}</main> });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
const api = "/api/admin/stores/tablecast-store";

it("券面をアップロードして出所と二言語の交換ルールをフォームから保存する", async () => {
  const rules: unknown[] = [];
  const uploads: FormData[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === `${api}/images`) {
      uploads.push(await request.formData());
      return Response.json({
        imageKey: "tablecast/coupon.webp",
        imageKind: "illustration",
        imageSource: { generated: false, description: "店舗が利用を許可した券面" },
        url: "/media/tablecast/coupon.webp",
      });
    }
    if (path === `${api}/coupons/rules`) {
      const value = await request.json();
      rules.push(value);
      const saved = couponDefinitionSchema.pick({ id: true, expectedVersion: true }).parse(value);
      return Response.json({ id: saved.id, version: saved.expectedVersion + 1 });
    }
    throw new Error(`未定義の要求: ${path}`);
  });
  const saved = vi.fn<() => void>();
  await show(<CouponRuleForm storeId="tablecast-store" onSaved={saved} />);
  await page.getByRole("textbox", { name: ja.coupon_title_ja }).fill("会員の100円割引");
  await page.getByRole("textbox", { name: ja.coupon_title_en }).fill("Member discount");
  await page
    .getByRole("textbox", { name: ja.coupon_description_ja })
    .fill("会計から100円引きます。");
  await page
    .getByRole("textbox", { name: ja.coupon_description_en })
    .fill("JPY 100 off your bill.");
  await page.getByRole("combobox", { name: ja.coupon_trigger }).selectOptions("exchange");
  await page.getByRole("spinbutton", { name: ja.coupon_threshold }).fill("3");
  await page
    .getByLabelText(ja.editor_image_choose)
    .upload(
      new File(
        [
          Uint8Array.fromBase64(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
          ),
        ],
        "tablecast-coupon.png",
        { type: "image/png" },
      ),
    );
  await page
    .getByRole("textbox", { name: ja.editor_image_source, exact: true })
    .fill("店舗が利用を許可した券面");
  await page.getByRole("button", { name: ja.editor_image_upload }).click();
  await expect
    .element(page.getByRole("button", { name: ja.account_save, exact: true }))
    .toBeEnabled();
  await page.getByRole("button", { name: ja.account_save, exact: true }).click();
  await expect.poll(() => saved.mock.calls.length).toBe(1);
  expect(uploads).toHaveLength(1);
  expect(uploads[0]?.get("metadata")).toContain("店舗が利用を許可した券面");
  expect(rules).toMatchObject([
    {
      expectedVersion: 0,
      active: true,
      rules: {
        title: { ja: "会員の100円割引", en: "Member discount" },
        description: { ja: "会計から100円引きます。", en: "JPY 100 off your bill." },
        imageKey: "tablecast/coupon.webp",
        imageSource: { generated: false, description: "店舗が利用を許可した券面" },
        trigger: "exchange",
        threshold: 3,
      },
    },
  ]);
});

it("参加者を選んでポイント付与を確定し、返された結果へ再取得する", async () => {
  let confirmed = false;
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname !== `${api}/tables/tablecast-visit/points`)
      throw new Error(`未定義の要求: ${request.url}`);
    if (request.method === "POST") {
      writes.push(await request.json());
      confirmed = true;
      return Response.json({ saved: true });
    }
    return Response.json({
      expectedVersion: 4,
      confirmedAt: confirmed ? 1 : null,
      participants: [
        { id: "person-1", membershipId: "member-1", name: "本人", active: true },
        { id: "person-2", membershipId: "member-2", name: "同行者", active: true },
      ],
      allocations: confirmed ? [{ membershipId: "member-1", amount: 100, points: 4 }] : [],
    });
  });
  await show(<PointVisit storeId="tablecast-store" sessionId="tablecast-visit" />);
  await page.getByRole("checkbox", { name: "本人", exact: true }).click();
  await page.getByRole("button", { name: ja.customer_points_award, exact: true }).click();
  await expect.element(page.getByText(ja.customer_points_confirmed, { exact: true })).toBeVisible();
  await expect.element(page.getByText("本人 · ¥100 · 4 pt", { exact: true })).toBeVisible();
  expect(writes).toMatchObject([{ expectedVersion: 4, participantIds: ["person-1"] }]);
});

it("申請された券を会計に適用し、理由付き取消で割引とフォームを更新する", async () => {
  let applied = false;
  let version = 4;
  const writes: { path: string; value: unknown }[] = [];
  const path = `${api}/tables/tablecast-visit/coupons`;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url).pathname;
    if (url === path)
      return Response.json({
        expectedVersion: version,
        requested: applied
          ? []
          : [
              {
                id: "coupon",
                name: "本人",
                rules: {
                  title: { ja: "会員割引", en: "Member discount" },
                  discountKind: "fixed",
                  discountValue: 100,
                  minimumYen: 0,
                },
              },
            ],
        uses: applied ? [{ id: "use", discount: 100 }] : [],
      });
    writes.push({ path: url, value: await request.json() });
    if (url === `${path}/apply`) applied = true;
    else if (url === `${path}/cancel`) applied = false;
    else throw new Error(`未定義の要求: ${url}`);
    version++;
    return Response.json({ saved: true });
  });
  await show(<CouponVisit storeId="tablecast-store" sessionId="tablecast-visit" />);
  await page.getByRole("button", { name: ja.coupon_apply, exact: true }).click();
  await expect.element(page.getByText("−¥100", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: ja.coupon_reason, exact: true })
    .fill("会計訂正のため取消");
  await page.getByRole("button", { name: ja.coupon_cancel, exact: true }).click();
  await expect.element(page.getByText("−¥100", { exact: true })).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: ja.coupon_apply, exact: true }))
    .toBeEnabled();
  expect(writes).toMatchObject([
    {
      path: `${path}/apply`,
      value: { couponId: "coupon", expectedVersion: 4 },
    },
    {
      path: `${path}/cancel`,
      value: {
        useId: "use",
        reason: "会計訂正のため取消",
        expectedVersion: 5,
      },
    },
  ]);
});
