import { expect, it, onTestFinished, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { GamePackage, GameState } from "@tablecast/api/schema";
import { GameFrame } from "./game-frame";
import { LocaleProvider } from "../i18n/locale";

const manifest: GamePackage["manifest"] = {
  apiVersion: 1,
  name: { ja: "検証ゲーム", en: "Test game" },
  description: { ja: "検証", en: "Test" },
  rules: { ja: "交代", en: "Take turns" },
  minPlayers: 2,
  maxPlayers: 4,
  capabilities: ["state"],
};
const initialState = {};
const parentOrigin = window.location.origin;

it("隔離した生成コードは親DOM・Cookie・外部通信へ到達できず、許可した状態だけを保存する", async () => {
  document.cookie = "tablecast-game-test=parent; Path=/; SameSite=Strict";
  onTestFinished(() => {
    document.cookie = "tablecast-game-test=; Path=/; Max-Age=0";
  });
  expect(document.cookie).toContain("tablecast-game-test=parent");
  const onSave = vi.fn<(value: GameState) => Promise<void>>().mockResolvedValue();
  const onExit = vi.fn<() => void>();
  const target = new URL("/favicon.ico", window.location.href).href;
  const game: GamePackage = {
    manifest,
    html: '<div id="game"></div>',
    css: "",
    javascript: `
    tablecast.ready.then(async (context) => {
      const result = { locale: context.locale, players: context.players };
      try { parent.document.body.dataset.gameEscaped = "true"; result.parent = "allowed"; } catch { result.parent = "blocked"; }
      try { result.cookie = document.cookie.includes("tablecast-game-test=parent") ? "allowed" : "blocked"; } catch { result.cookie = "blocked"; }
      const violation = new Promise(resolve => addEventListener("securitypolicyviolation", event => { if (event.effectiveDirective === "connect-src") resolve(event.effectiveDirective); }));
      try { await fetch(${JSON.stringify(target)}, {mode: "no-cors"}); result.network = "allowed"; } catch { result.network = "blocked"; result.policy = await violation; }
      try { localStorage.setItem("tablecast-game-test", "value"); result.storage = "allowed"; } catch { result.storage = "blocked"; }
      await tablecast.save(result);
      tablecast.exit();
    });`,
  };
  await render(
    <LocaleProvider initialLocale="en" persist={false}>
      <GameFrame
        game={game}
        parentOrigin={parentOrigin}
        locale="en"
        players={3}
        initialState={initialState}
        onSave={onSave}
        onExit={onExit}
      />
    </LocaleProvider>,
  );
  await expect
    .poll(() => onSave.mock.calls[0]?.[0])
    .toEqual({
      locale: "en",
      players: 3,
      parent: "blocked",
      cookie: "blocked",
      network: "blocked",
      policy: "connect-src",
      storage: "blocked",
    });
  await expect.poll(() => onExit.mock.calls.length).toBe(1);
  expect(document.body.dataset.gameEscaped).toBeUndefined();
});

it("別Window・偽の送信元・未許可の状態保存から本体を操作できない", async () => {
  const onSave = vi.fn<(value: GameState) => Promise<void>>().mockResolvedValue();
  const onExit = vi.fn<() => void>();
  const onReady = vi.fn<() => void>();
  const game: GamePackage = {
    manifest: { ...manifest, capabilities: [] },
    html: "<p>検証</p>",
    css: "",
    javascript: `
    tablecast.ready.then(async () => { try { await tablecast.save({forbidden: true}); } catch { tablecast.exit(); } });`,
  };
  await render(
    <GameFrame
      game={game}
      parentOrigin={parentOrigin}
      locale="ja"
      players={2}
      initialState={initialState}
      onReady={onReady}
      onSave={onSave}
      onExit={onExit}
    />,
  );
  await expect.poll(() => onExit.mock.calls.length).toBe(1);
  expect(onSave).not.toHaveBeenCalled();
  const frame = document.querySelector("iframe");
  if (!frame) throw new Error("ゲームframeがありません");
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "null",
      source: window,
      data: { type: "tablecast.game.exit" },
    }),
  );
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: window.location.origin,
      source: frame.contentWindow,
      data: { type: "tablecast.game.exit" },
    }),
  );
  expect(onExit).toHaveBeenCalledTimes(1);
  expect(onReady).toHaveBeenCalledTimes(1);
});
