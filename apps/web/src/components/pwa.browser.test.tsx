import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { Pwa } from "./pwa";

// Worker登録だけを省略し、ページの判定・Query・Router・MessageChannelは実物を使う
vi.mock("@serwist/window", () => ({
  Serwist: class {
    register() {
      return Promise.resolve(undefined);
    }
    addEventListener() {}
    removeEventListener() {}
  },
}));

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function mount(loader = async () => {}) {
  vi.stubEnv("PROD", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <>
        <Pwa />
        <Outlet />
      </>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <main /> });
  const next = createRoute({ getParentRoute: () => root, path: "/login", loader });
  const router = createRouter({
    routeTree: root.addChildren([home, next]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function decision(type: string) {
  const channel = new MessageChannel();
  try {
    const result = new Promise<unknown>((resolve) => {
      channel.port1.addEventListener(
        "message",
        (event: MessageEvent<unknown>) => resolve(event.data),
        { once: true },
      );
      channel.port1.start();
    });
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent("message", {
        data: { type },
        ports: [channel.port2],
      }),
    );
    return await result;
  } finally {
    channel.port1.close();
    channel.port2.close();
  }
}

it("背景GETが未完了でも安全な画面は更新を許可する", async () => {
  await mount();
  const gate = Promise.withResolvers<null>();
  const queryFn = () => gate.promise;
  client.setQueryData(["tablecast-pwa-background"], null);
  const fetching = client.fetchQuery({
    queryKey: ["tablecast-pwa-background"],
    queryFn,
  });
  try {
    expect(client.isFetching()).toBe(1);
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
    expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(true);
    expect(document.body.inert).toBe(true);
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent("message", { data: { type: "TABLECAST_CANCEL_UPDATE" } }),
    );
    expect(document.body.inert).toBe(false);
  } finally {
    gate.resolve(null);
    await fetching;
  }
});

it("送信中は更新を拒否し、完了すると許可する", async () => {
  await mount();
  // 最初の確認後に送信が始まっても、適用直前の再確認で拒否する
  expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
  const gate = Promise.withResolvers<void>();
  const mutation = client.getMutationCache().build(client, { mutationFn: () => gate.promise });
  const sending = mutation.execute(undefined);
  try {
    expect(client.isMutating()).toBe(1);
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(false);
    expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(false);
    expect(document.body.inert).toBe(false);
  } finally {
    gate.resolve();
    await sending;
  }
  expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
});

it("画面遷移中は更新を拒否し、遷移完了後に許可する", async () => {
  const gate = Promise.withResolvers<void>();
  const router = await mount(() => gate.promise);
  const navigation = router.navigate({ to: "/login" });
  try {
    await expect.poll(() => router.state.status).toBe("pending");
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(false);
    expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(false);
  } finally {
    gate.resolve();
    await navigation;
  }
  expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
});

it("保護中の要素と未対応フォームは更新を拒否する", async () => {
  await mount();
  const form = document.createElement("form");
  const button = document.createElement("button");
  form.appendChild(button);
  document.body.appendChild(form);
  try {
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(false);
    button.dataset.pwaBlocked = "true";
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(false);
    expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(false);
    button.dataset.pwaBlocked = "false";
    expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
  } finally {
    form.remove();
  }
  // フォーム以外の接客・端末登録の保護も判定する
  const protectedArea = document.createElement("div");
  protectedArea.dataset.pwaBlocked = "true";
  document.body.appendChild(protectedArea);
  try {
    expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(false);
  } finally {
    protectedArea.remove();
  }
});

it("オフラインでは更新を拒否し、通信復帰後に許可する", async () => {
  await mount();
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(false);
  expect(await decision("TABLECAST_PREPARE_UPDATE")).toBe(false);
  online.mockRestore();
  expect(await decision("TABLECAST_CHECK_UPDATE")).toBe(true);
});
