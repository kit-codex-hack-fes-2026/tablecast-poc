import { beforeEach, expect, it, vi } from "vitest";
import { cleanupCatalogs } from "./tablecast-catalog-deploy";
import { cloudflare, currentRevision } from "./tablecast-deploy-api";
vi.mock("./tablecast-deploy-api", () => ({
  cloudflare: vi.fn<typeof cloudflare>(),
  currentRevision: vi.fn<typeof currentRevision>(),
}));

let workers: Set<string>;
let apps: Map<string, { id: string; name: string; domain: string }>;
let failWorker: boolean;
beforeEach(() => {
  vi.resetAllMocks();
  workers = new Set(["tablecast-email-pr-129", "tablecast", "tablecast-email-pr-130"]);
  apps = new Map([
    ...["129", "130"].map(
      (pr) =>
        [
          `app-${pr}`,
          {
            id: `app-${pr}`,
            name: `tablecast-email-pr-${pr}`,
            domain: `tablecast-email-pr-${pr}.kit-codex.workers.dev`,
          },
        ] as const,
    ),
  ]);
  failWorker = false;
  vi.mocked(cloudflare).mockImplementation(async (path, method) => {
    if (path === "workers/scripts" && method === undefined)
      return [...workers].map((id) => ({ id }));
    if (path === "access/apps?per_page=1000") return [...apps.values()];
    if (path.startsWith("workers/workers/"))
      return { id: "worker-id", name: path.split("/").at(-1) };
    if (method === "DELETE" && path.startsWith("workers/scripts/")) {
      if (failWorker) throw new Error("Cloudflare HTTP 403");
      workers.delete(path.split("/").at(-1) ?? "");
      return null;
    }
    if (method === "DELETE" && path.startsWith("access/apps/")) {
      apps.delete(path.split("/").at(-1) ?? "");
      return null;
    }
    throw new Error("対象外のCloudflare API");
  });
});
it("製品DBがなくても対象カタログだけを削除し、再実行できる", async () => {
  await cleanupCatalogs("129");
  await cleanupCatalogs("129");
  expect([...workers]).toEqual(["tablecast", "tablecast-email-pr-130"]);
  expect([...apps.keys()]).toEqual(["app-130"]);
});
it("Workerの削除に失敗したらAccessを残す", async () => {
  failWorker = true;
  await expect(cleanupCatalogs("129")).rejects.toThrow("403");
  expect(workers.has("tablecast-email-pr-129")).toBe(true);
  expect(apps.has("app-129")).toBe(true);
});
it("PRが再開していたら資源を変更しない", async () => {
  vi.mocked(currentRevision).mockRejectedValue(new Error("PRはopen"));
  await expect(cleanupCatalogs("129")).rejects.toThrow("open");
  expect(workers.has("tablecast-email-pr-129")).toBe(true);
  expect(apps.has("app-129")).toBe(true);
});
