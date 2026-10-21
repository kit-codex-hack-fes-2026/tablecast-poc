import { type GamePackage, gameStateSchema } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { z } from "zod";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { tableEndpoint } from "../../lib/api";
import "../../styles.css";
import { KioskGames } from "./games";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

const game: GamePackage = {
  manifest: {
    apiVersion: 1,
    name: { ja: "順番ゲーム", en: "Taking turns" },
    description: { ja: "二人で遊びます", en: "Play together" },
    rules: { ja: "交代します", en: "Take turns" },
    minPlayers: 2,
    maxPlayers: 4,
    capabilities: ["state"],
  },
  html: "<p>ゲーム</p>",
  css: "",
  // 実iframeのSDKから保存し、復帰時に渡された状態は再保存しない。
  javascript: `tablecast.ready.then(({state, locale, players}) => {
    parent.postMessage({type: "tablecast-test-snapshot", state}, "*");
    if (!state.turn) tablecast.save({turn: 2, locale, players});
  });`,
};

it("日本語で保存・通信復旧・公開停止・開始遅着を扱う", async () => {
  const locale = "ja";
  const labels = ja;
  let state = {};
  let revision = 0;
  let failure = 0;
  let delayed: Promise<Response> | undefined;
  const ended: string[] = [];
  const saves: unknown[] = [];
  const snapshots: unknown[] = [];
  const observe = (event: MessageEvent<unknown>) => {
    const message = z
      .object({ type: z.literal("tablecast-test-snapshot"), state: gameStateSchema })
      .safeParse(event.data);
    if (message.success) snapshots.push(message.data.state);
  };
  window.addEventListener("message", observe);
  onTestFinished(() => window.removeEventListener("message", observe));
  let starts = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/table/games")
      return Response.json({
        games: [{ id: "tablecast-turns", manifest: game.manifest }],
        next: null,
      });
    if (path === "/api/table/games/tablecast-turns/start") {
      starts++;
      return (
        delayed ??
        Response.json({
          id: "tablecast-run",
          versionId: "tablecast-v1",
          package: game,
          parentOrigin: window.location.origin,
          locale,
          players: 2,
          state,
          revision,
        })
      );
    }
    if (path === "/api/table/games/runs/tablecast-run/state") {
      const value = z
        .object({ expectedVersion: z.number(), state: gameStateSchema })
        .parse(await request.json());
      saves.push(value);
      state = value.state;
      revision++;
      return Response.json({ revision });
    }
    if (path.endsWith("/end")) {
      ended.push(path);
      return Response.json({ ended: true });
    }
    if (path === "/api/table/games/runs/tablecast-run") {
      if (failure)
        return Response.json({ error: { code: "GAME_UNAVAILABLE" } }, { status: failure });
      return Response.json({ id: "tablecast-run", versionId: "tablecast-v1", state, revision });
    }
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const stopVoice = vi.fn<() => Promise<void>>().mockResolvedValue();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <KioskGames endpoint={tableEndpoint} locale={locale} players={2} stopVoice={stopVoice} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await page.getByRole("button", { name: labels.games_title, exact: true }).click();
  expect(stopVoice).toHaveBeenCalledOnce();
  await expect
    .element(page.getByRole("heading", { name: game.manifest.name[locale] }))
    .toBeVisible();
  await page.getByRole("button", { name: labels.games_start, exact: true }).click();
  await expect
    .poll(() => saves)
    .toEqual([{ expectedVersion: 0, state: { turn: 2, locale, players: 2 } }]);
  const key = ["tablecast-game-run", "table", "tablecast-run"];
  failure = 503;
  await client.refetchQueries({ queryKey: key, exact: true });
  await expect.element(page.getByTitle(game.manifest.name[locale])).not.toBeInTheDocument();
  await expect.element(page.getByText(labels.games_unavailable, { exact: true })).toBeVisible();
  failure = 0;
  await client.refetchQueries({ queryKey: key, exact: true });
  await expect.element(page.getByTitle(game.manifest.name[locale])).toBeVisible();
  await expect.poll(() => snapshots).toEqual([{}, { turn: 2, locale, players: 2 }]);
  expect(saves).toHaveLength(1);
  failure = 409;
  await client.refetchQueries({ queryKey: key, exact: true });
  await expect.element(page.getByTitle(game.manifest.name[locale])).not.toBeInTheDocument();
  await page.getByRole("button", { name: labels.games_return, exact: true }).click();
  await expect.poll(() => ended.length).toBe(1);
  await page.getByRole("button", { name: labels.games_title, exact: true }).click();
  const response = Promise.withResolvers<Response>();
  delayed = response.promise;
  const completed = Response.json({
    id: "tablecast-delayed",
    versionId: "tablecast-v1",
    package: game,
    parentOrigin: window.location.origin,
    locale,
    players: 2,
    state: {},
    revision: 0,
  });
  try {
    await page.getByRole("button", { name: labels.games_start, exact: true }).click();
    await expect.poll(() => starts).toBe(2);
    await page.getByRole("button", { name: labels.games_return, exact: true }).click();
    response.resolve(completed);
    await expect
      .poll(() => ended)
      .toEqual([
        "/api/table/games/runs/tablecast-run/end",
        "/api/table/games/runs/tablecast-delayed/end",
      ]);
    await page.getByRole("button", { name: labels.games_title, exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: labels.games_start, exact: true }))
      .toBeEnabled();
    await expect.element(page.getByTitle(game.manifest.name[locale])).not.toBeInTheDocument();
  } finally {
    response.resolve(completed);
    await expect.poll(() => client.isMutating()).toBe(0);
  }
});
