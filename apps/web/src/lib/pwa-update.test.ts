import { afterEach, expect, it, vi } from "vitest";
import { canReloadPwaClient, preparePwaClients } from "./pwa-update";

afterEach(() => vi.useRealTimers());

it("承認したSWの切替がロック期限後でも、安全な画面へ一度だけ反映する", () => {
  const previous = {};
  const next = {};
  const state = {
    preparedController: previous,
    controller: next,
    locked: false,
    ready: true,
    reloading: false,
  };
  expect(canReloadPwaClient(state)).toBe(true);
  // 期限後に未保存入力や送信が始まった画面は、その完了まで待つ。
  expect(canReloadPwaClient({ ...state, ready: false })).toBe(false);
  expect(canReloadPwaClient({ ...state, reloading: true })).toBe(false);
});

it("初回のcontroller取得・切替前・取消済みの更新ではreloadしない", () => {
  const previous = {};
  const state = {
    preparedController: previous,
    controller: previous,
    locked: false,
    ready: true,
    reloading: false,
  };
  expect(canReloadPwaClient(state)).toBe(false);
  expect(canReloadPwaClient({ ...state, preparedController: undefined, controller: {} })).toBe(
    false,
  );
  expect(canReloadPwaClient({ ...state, controller: null })).toBe(false);
});
function client(id: string, answer: unknown) {
  return {
    id,
    postMessage: (_message: unknown, transfer: Transferable[]) => {
      const port = transfer[0];
      if (port instanceof MessagePort) {
        port.postMessage(answer);
        port.close();
      }
    },
  };
}
it("全画面が安全と応答したときだけ更新を許可する", async () => {
  // Given: 二つの応答可能な画面。
  const clients = [client("table", true), client("staff", true)];
  // When / Then: 全画面の明示的な応答を確認する。
  expect(await preparePwaClients(clients)).toBe(true);
  expect(await preparePwaClients([client("table", true), client("staff", false)])).toBe(false);
  expect(await preparePwaClients([client("legacy", "true")])).toBe(false);
});
it("休止中など応答のない画面があると更新を待機する", async () => {
  // Given: Service Workerへの応答が届かない画面。
  vi.useFakeTimers();
  const result = preparePwaClients([{ id: "sleeping", postMessage: () => undefined }]);
  // When: 応答期限が経過する。
  await vi.advanceTimersByTimeAsync(3000);
  // Then: 応答なしを安全と見なさない。
  expect(await result).toBe(false);
});
