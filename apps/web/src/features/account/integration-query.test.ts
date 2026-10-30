import { expect, test } from "vitest";
import { integrationConnection } from "./integration-query";

test("導入案内は環境によらず共通名と現在のoriginの接続先を使う", () => {
  for (const origin of [
    "https://tablecast.kit-codex.workers.dev",
    "https://tablecast-staging.kit-codex.workers.dev",
    "http://localhost:3000",
    "https://tablecast-pr-189.kit-codex.workers.dev",
    "https://tablecast-staging.kit-codex.workers.dev.attacker.test",
  ]) {
    expect(integrationConnection(origin)).toEqual({
      name: "tablecast",
      endpoint: `${origin}/mcp`,
    });
  }
});
