import { describe, expect, it } from "vitest";
import { catalogReleaseSchema, catalogTarget } from "./tablecast-catalog-config";
import { ownedCatalogApplication } from "./tablecast-catalog-deploy";

describe("カタログの対象境界", () => {
  it.each(["", "0", "../1", "1/production", "1000000000"])("不正PR %s を資源名にしない", (pr) => {
    expect(() => catalogTarget(pr, "email")).toThrow(Error);
  });
  it("種別とPRを別ホストにする", () => {
    const values = [
      catalogTarget("129", "email"),
      catalogTarget("129", "storybook"),
      catalogTarget("130", "email"),
    ];
    expect(new Set(values.map((value) => value.origin)).size).toBe(3);
  });
  it("別repositoryのartifactを採用しない", () => {
    expect(
      catalogReleaseSchema.safeParse({
        repository: "other/repo",
        pr: "129",
        kind: "email",
        sha: "a".repeat(40),
        paths: ["/"],
      }).success,
    ).toBe(false);
  });
  it("他のAccess対象を削除・更新しない", () => {
    expect(() =>
      ownedCatalogApplication(
        { id: "app", name: "tablecast-email-pr-129", domain: "other.example" },
        "tablecast-email-pr-129",
        "tablecast-email-pr-129.kit-codex.workers.dev",
      ),
    ).toThrow(Error);
    expect(() =>
      ownedCatalogApplication(
        {
          id: "app",
          name: "tablecast-email-pr-129",
          domain: "tablecast-email-pr-129.kit-codex.workers.dev",
          destinations: [{ type: "all_workers" }],
        },
        "tablecast-email-pr-129",
        "tablecast-email-pr-129.kit-codex.workers.dev",
      ),
    ).toThrow(Error);
  });
});
