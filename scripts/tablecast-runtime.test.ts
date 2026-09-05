import { describe, expect, it } from "vitest";
import { assertLocalRuntime, worktreeId } from "./tablecast-runtime";

describe("開発資源の所有境界", () => {
  it("同じブランチでもworktree実パスが違う場合は識別子が分かれる", () => {
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).not.toBe(
      worktreeId("/tmp/tablecast-two", "/tmp/tablecast/.git"),
    );
    expect(worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git")).toBe(
      worktreeId("/tmp/tablecast-one", "/tmp/tablecast/.git"),
    );
  });
  it("本番origin・別保存先・重複ポートへのreset要求を拒否する", () => {
    const runtime = {
      id: "0123456789",
      root: "/tmp/tablecast",
      origin: "http://tablecast-0123456789.localhost:3000",
      ports: {
        proxy: 3000,
        web: 3001,
        inspector: 3002,
        signaling: 3003,
        rtcTcp: 3004,
        rtcUdp: 3005,
        agent: 3006,
        storybook: 3007,
      },
      state: "/tmp/tablecast/.local/state",
      apiConfig: "/tmp/tablecast/.local/api.wrangler.json",
      webConfig: "/tmp/tablecast/.local/web.wrangler.json",
    };
    expect(() => assertLocalRuntime(runtime, runtime.root)).not.toThrow(
      "別worktree・非ローカル・不整合の設定を操作できません。",
    );
    expect(() =>
      assertLocalRuntime({ ...runtime, origin: "https://tablecast.example.com" }, runtime.root),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
    expect(() =>
      assertLocalRuntime({ ...runtime, state: "/tmp/tablecast-other/.local/state" }, runtime.root),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
    expect(() =>
      assertLocalRuntime(
        { ...runtime, ports: { ...runtime.ports, signaling: 3001 } },
        runtime.root,
      ),
    ).toThrow("別worktree・非ローカル・不整合の設定を操作できません。");
  });
});
