import { expect, test } from "vitest";
import { integrationConnection } from "./integration-query";

test("staging以外の導入案内は公開pluginの本番接続先を維持する", () => {
  for (const origin of [
    "https://tablecast.kit-codex.workers.dev",
    "http://localhost:3000",
    "https://tablecast-pr-189.kit-codex.workers.dev",
    "https://tablecast-staging.kit-codex.workers.dev.attacker.test",
  ]) {
    expect(integrationConnection(origin)).toEqual({
      staging: false,
      name: "tablecast",
      endpoint: "https://tablecast.kit-codex.workers.dev/mcp",
    });
  }
});
