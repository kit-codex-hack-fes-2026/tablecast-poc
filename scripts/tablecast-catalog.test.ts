import { describe, expect, it, vi } from "vitest";
import { emailResponse } from "../apps/email-preview/tablecast-email-worker";
import { catalogReleaseSchema, catalogTarget } from "./tablecast-catalog-config";
import { ownedCatalogApplication } from "./tablecast-catalog-deploy";
import { catalogReport, catalogCommentMarker } from "./tablecast-preview-report";
import { tablecastRepository } from "./tablecast-deploy-config";

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

describe("メール閲覧専用境界", () => {
  const paths = new Set(["/", "/preview/invitation"]);
  it.each(["POST", "PUT", "DELETE", "PATCH", "OPTIONS"])("%sを上流へ渡さない", async (method) => {
    const upstream = vi.fn<(request: Request) => Promise<Response>>();
    const response = await emailResponse(
      new Request("https://example.invalid/preview/invitation", { method }),
      paths,
      upstream,
      upstream,
    );
    expect(response.status).toBe(405);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    "/preview/missing",
    "/api/send/test",
    "/_next/image",
    "/cdn-cgi/image/x",
    "/_next/data/x",
    "/cdn-cgi/access/../x",
  ])("未知経路 %s を上流へ渡さない", async (path) => {
    const upstream = vi.fn<(request: Request) => Promise<Response>>();
    const response = await emailResponse(
      new Request(`https://example.invalid${path}`),
      paths,
      upstream,
      upstream,
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("許可ページを返して送信をCSPで制限する", async () => {
    const assets = vi.fn<(request: Request) => Promise<Response>>();
    const page = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response("メール本文"));
    const response = await emailResponse(
      new Request("https://example.invalid/preview/invitation"),
      paths,
      assets,
      page,
    );
    expect(await response.text()).toBe("メール本文");
    expect(assets).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'none'");
    expect(response.headers.get("Content-Security-Policy")).not.toContain("react.email");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("releaseとHEADをassetsから返して本文を付けない", async () => {
    const assets = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(new Response("release"));
    const page = vi.fn<(request: Request) => Promise<Response>>();
    const response = await emailResponse(
      new Request("https://example.invalid/_tablecast/release.json", { method: "HEAD" }),
      paths,
      assets,
      page,
    );
    expect(await response.text()).toBe("");
    expect(page).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

it("失敗時も対象SHAと最後の確認SHAを区別し、未確認版を推測しない", () => {
  const body = catalogReport(
    "129",
    "a".repeat(40),
    "build: failure",
    { storybook: "b".repeat(40) },
    `https://github.com/${tablecastRepository}/actions/runs/1`,
  );
  expect(body.startsWith(catalogCommentMarker)).toBe(true);
  expect(body).toContain("a".repeat(40));
  expect(body).toContain("b".repeat(40));
  expect(body).toContain("未確認（現在版不明）");
});
