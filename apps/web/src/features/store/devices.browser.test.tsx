import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { QRCodeSVG } from "qrcode.react";
import { cleanup, render } from "vitest-browser-react";
import { page, server, userEvent, type Locator } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { Devices, RegisterDevice } from "./devices";
import { devicesOptions } from "./store-query";
import { RouteError, RoutePending } from "../../components/route-state";
import { StoreShell } from "./store-shell";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

const storeId = "tablecast-registration";
const base = `/admin/stores/${storeId}/devices`;
let client: QueryClient;
let unexpected: string[];
let approvals: unknown[];
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.fontSize = "";
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

async function show(
  locale: "ja" | "en",
  initial = `${base}/new?user_code=TABLECAST-URL&tableId=tablecast-first`,
  readDevices?: () => Promise<Response>,
) {
  unexpected = [];
  approvals = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      {
        id: storeId,
        name: "端末登録店",
        logo: null,
        role: "owner",
        organizationId: "tablecast-org",
      },
    ],
  });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (path === `/api${base}` && readDevices) return readDevices();
    if (path === `/api${base}`)
      return Response.json({
        devices: [],
        tables: [
          { id: "tablecast-first", name: "T01" },
          { id: "tablecast-second", name: "T02" },
        ],
      });
    if (path === `/api${base}/approve`) {
      approvals.push(await request.json());
      return Response.json({ ok: true });
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const register = createRoute({
    getParentRoute: () => store,
    path: "devices/new",
    validateSearch: z.object({ user_code: z.string().optional(), tableId: z.string().optional() }),
  });
  register.update({
    component: () => {
      const search = register.useSearch();
      return <RegisterDevice userCode={search.user_code ?? ""} tableId={search.tableId} />;
    },
  });
  const list = createRoute({
    getParentRoute: () => store,
    path: "devices",
    loader: () => client.ensureQueryData(devicesOptions(storeId)),
    pendingComponent: RoutePending,
    errorComponent: RouteError,
    component: Devices,
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([register, list])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
  });
  const view = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { router, view };
}

async function tabTo(control: Locator) {
  const key =
    server.platform === "darwin" && server.browser === "webkit" ? "{Alt>}{Tab}{/Alt}" : "{Tab}";
  for (let count = 0; count < 80 && control.element() !== document.activeElement; count++)
    await userEvent.keyboard(key);
  await expect.element(control).toHaveFocus();
}

function enlargeText(scope: Element) {
  // 取得済みの文字サイズをまとめて2倍にし、親要素の変更を子へ重ねない
  const sizes = [scope, ...scope.querySelectorAll<HTMLElement>("*")]
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        (element.matches("input, select, textarea") ||
          [...element.childNodes].some(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          )),
    )
    .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
  for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
}

async function expectReadableControl(control: Locator) {
  await expect.element(control).toBeVisible();
  const element = control.element();
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const bounds = element.getBoundingClientRect();
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
  const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let node = text.nextNode();
  while (node) {
    if (node.textContent?.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      rects.push(...range.getClientRects());
    }
    node = text.nextNode();
  }
  for (const rect of rects) {
    expect(rect.left).toBeGreaterThanOrEqual(bounds.left - 2);
    expect(rect.right).toBeLessThanOrEqual(bounds.right + 2);
    expect(rect.top).toBeGreaterThanOrEqual(bounds.top - 2);
    expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom + 2);
  }
}

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeの端末コードと卓をURLで復元し、明示承認まで送信しない",
  async ({ locale, labels }) => {
    await page.viewport(1024, 768);
    const { router, view } = await show(locale);
    const code = page.getByLabelText(labels.admin_pair_code, { exact: true });
    await expect.element(code).toHaveValue("TABLECAST-URL");
    const row = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "T02", exact: true }) });
    const table = page.getByRole("table");
    const before = [...table.element().querySelectorAll("th")].map(
      (cell) => cell.getBoundingClientRect().width,
    );
    await row.getByRole("button").click();
    await expect.element(row.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(
      [...table.element().querySelectorAll("th")].map((cell) => cell.getBoundingClientRect().width),
    ).toEqual(before);
    expect(router.state.location.search).toMatchObject({
      user_code: "TABLECAST-URL",
      tableId: "tablecast-second",
    });
    expect(approvals).toEqual([]);
    const url = router.state.location.href;
    await view.unmount();
    client.clear();
    await show(locale, url);
    await expect.element(code).toHaveValue("TABLECAST-URL");
    await expect.element(row.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: labels.admin_approve, exact: true }).click();
    await expect
      .element(page.getByRole("heading", { name: labels.device_title, exact: true }))
      .toBeVisible();
    expect(approvals).toEqual([{ userCode: "TABLECAST-URL", tableId: "tablecast-second" }]);
  },
);

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeの端末登録は文字を200%にしてもコードと卓を読み、キーボードで承認できる",
  async ({ locale, labels }) => {
    await page.viewport(1024, 768);
    await show(locale);
    const code = page.getByLabelText(labels.admin_pair_code, { exact: true });
    const approve = page.getByRole("button", { name: labels.admin_approve, exact: true });
    const originalSize = Number.parseFloat(getComputedStyle(code.element()).fontSize);
    enlargeText(page.getByRole("main").element());
    expect(Number.parseFloat(getComputedStyle(code.element()).fontSize)).toBe(originalSize * 2);
    await expectReadableControl(code);
    await expectReadableControl(approve);
    const table = page.getByRole("table");
    await expect.element(table).toBeVisible();
    const row = table
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: "T02", exact: true }) });
    const choose = row.getByRole("button");
    await expectReadableControl(choose);
    await tabTo(code);
    await userEvent.keyboard(
      server.platform === "darwin" ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
    );
    await userEvent.keyboard("TABLECAST-200");
    await expect.element(code).toHaveValue("TABLECAST-200");
    await tabTo(choose);
    await userEvent.keyboard("{Enter}");
    await expect.element(choose).toHaveAttribute("aria-pressed", "true");
    expect(approvals).toEqual([]);
    await tabTo(approve);
    await page.screenshot({
      path: `test-results/browser/tablecast-device-text-200-${locale}-${server.browser}.png`,
    });
    await userEvent.keyboard("{Enter}");
    await expect
      .element(page.getByRole("heading", { name: labels.device_title, exact: true }))
      .toBeVisible();
    expect(approvals).toEqual([{ userCode: "TABLECAST-200", tableId: "tablecast-second" }]);
  },
);

it("QR画像を実decoderで読み、選択卓を保って承認後にだけ送信する", async () => {
  const { router } = await show("ja");
  const svg = renderToStaticMarkup(
    <QRCodeSVG
      xmlns="http://www.w3.org/2000/svg"
      value={`${window.location.origin}/device?user_code=TABLECAST-QR`}
      size={288}
      marginSize={4}
    />,
  );
  const image = new Image();
  image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 288;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR fixtureを描画できません");
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("QR fixtureを生成できません"))),
      "image/png",
    ),
  );
  await page
    .getByLabelText(ja.device_scan_image, { exact: true })
    .upload(new File([blob], "tablecast-qr.png", { type: "image/png" }));
  await expect
    .element(page.getByLabelText(ja.admin_pair_code, { exact: true }))
    .toHaveValue("TABLECAST-QR");
  expect(router.state.location.search).toMatchObject({
    user_code: "TABLECAST-QR",
    tableId: "tablecast-first",
  });
  expect(approvals).toEqual([]);
  await page.getByRole("button", { name: ja.admin_approve, exact: true }).click();
  await expect
    .poll(() => approvals)
    .toEqual([{ userCode: "TABLECAST-QR", tableId: "tablecast-first" }]);
});

it("カメラ拒否と壊れた画像を説明し、コードを手入力して続けられる", async () => {
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockRejectedValue(
    new DOMException("拒否", "NotAllowedError"),
  );
  await show("ja");
  await page.getByRole("button", { name: ja.device_scan_start, exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.device_scan_camera_error);
  await page
    .getByLabelText(ja.device_scan_image, { exact: true })
    .upload(new File(["broken"], "tablecast-broken.png", { type: "image/png" }));
  await expect.element(page.getByRole("alert")).toHaveTextContent(ja.device_scan_image_error);
  const code = page.getByLabelText(ja.admin_pair_code, { exact: true });
  await code.fill("manual-code");
  await expect.element(code).toHaveValue("MANUAL-CODE");
  expect(approvals).toEqual([]);
});

it("端末一覧の取得中・取得失敗・再試行後の0件を区別する", async () => {
  const release = Promise.withResolvers<Response>();
  const reached = Promise.withResolvers<void>();
  let first = true;
  try {
    await show("ja", base, async () => {
      if (first) {
        first = false;
        reached.resolve();
        return release.promise;
      }
      return Response.json({ devices: [], tables: [] });
    });
    await reached.promise;
    await expect.element(page.getByRole("status")).toBeVisible();
    await expect.element(page.getByText("0 件", { exact: true })).not.toBeInTheDocument();
    release.resolve(Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 }));
    await expect.element(page.getByRole("alert")).toBeVisible();
    await expect.element(page.getByText("0 件", { exact: true })).not.toBeInTheDocument();
    await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
    await expect
      .element(page.getByRole("heading", { name: ja.device_title, exact: true }))
      .toBeVisible();
    await expect.element(page.getByText("0 件", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  } finally {
    release.resolve(Response.json({ devices: [], tables: [] }));
  }
});
