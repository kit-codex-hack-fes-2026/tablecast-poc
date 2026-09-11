import { afterEach, expect, it, vi } from "vitest";
import { preparePwaClients } from "./pwa-update";

afterEach(() => vi.useRealTimers());
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
