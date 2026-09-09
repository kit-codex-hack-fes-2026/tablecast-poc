import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";

it("APIのレイヤー外importは拒否し、model・共有依存の型・module入口だけを許可する", async () => {
  // Given: 実設定を複製した隔離workspaceと、レイヤーを越えるimport。
  const root = resolve(import.meta.dirname, "..");
  const temporary = await mkdtemp(join(tmpdir(), "tablecast-import-rules-"));
  const cases = [
    {
      path: "modules/example/routes.ts",
      imports: [
        'export { drizzle } from "drizzle-orm/d1";',
        'export { createApiServices } from "../../platform/context";',
        'export { createAuth } from "../auth/service";',
        'export { rows } from "../../db/records";',
        'export { route } from "../orders/routes";',
        'export { Hono } from "hono";',
        'export type { ApiServices } from "../../platform/context";',
        'export { submitOrder } from "../orders/service";',
      ],
      rejectedLines: [1, 2, 3, 4, 5],
    },
    {
      path: "modules/example/service.ts",
      imports: [
        'export { Hono } from "hono";',
        'export { staffIdentity } from "../auth/middleware";',
        'export { route } from "./routes";',
        'export { drizzle } from "drizzle-orm/d1";',
        'export { hidden } from "../orders/internal/private";',
        'export { legacy } from "../../utils/database";',
        'export { contract } from "../../schema.ts";',
        'export type { ApiServices } from "../../platform/context";',
        'export { orderSchema } from "../orders/model";',
        'export { getSession } from "../tables/queries";',
      ],
      rejectedLines: [1, 2, 3, 4, 5, 6, 7],
    },
    {
      path: "modules/example/model.ts",
      imports: [
        'export { mutate } from "./service";',
        'export type { ApiServices } from "../../platform/context";',
        'export { sql } from "drizzle-orm";',
        'export { Hono } from "hono";',
        'export { orderSchema } from "../orders/model";',
        'export { localeSchema } from "../../platform/model";',
        'export { z } from "zod";',
      ],
      rejectedLines: [1, 2, 3, 4],
    },
    {
      path: "modules/example/queries.ts",
      imports: [
        'export { submitOrder } from "../orders/service";',
        'export { notifyStore } from "../tables/mutations";',
        'export { sql } from "drizzle-orm";',
        'export type { ApiServices } from "../../platform/context";',
      ],
      rejectedLines: [1, 2],
    },
    {
      path: "db/records.ts",
      imports: [
        'export { submitOrder } from "../modules/orders/service";',
        'export { Hono } from "hono";',
        'export { sqliteTable } from "drizzle-orm/sqlite-core";',
        'export { orders } from "./business-schema";',
      ],
      rejectedLines: [1, 2],
    },
    {
      path: "app.ts",
      imports: [
        'export { submitOrder } from "./modules/orders/service";',
        'export { schema } from "./db/business-schema";',
        'export { routes } from "./modules/orders/routes";',
        'export { requestServices } from "./platform/context";',
      ],
      rejectedLines: [1, 2],
    },
    {
      path: "modules/example/other.ts",
      imports: ["export const misplaced = true;"],
      rejectedLines: [1],
    },
    {
      path: "services/legacy.ts",
      imports: ["export const misplaced = true;"],
      rejectedLines: [1],
    },
    {
      path: "modules/stores/routes.ts",
      imports: [
        'export { route } from "../orders/routes";',
        'export { route } from "../voice/catalog-routes";',
        'export { route } from "../account/routes";',
      ],
      rejectedLines: [3],
    },
  ];
  try {
    await mkdir(join(temporary, "apps/api"), { recursive: true });
    await cp(join(root, "apps/api/src"), join(temporary, "apps/api/src"), { recursive: true });
    await cp(join(root, "tsconfig.json"), join(temporary, "tsconfig.json"));
    await cp(join(root, "apps/api/tsconfig.json"), join(temporary, "apps/api/tsconfig.json"));
    await cp(join(root, "oxlint.config.ts"), join(temporary, "oxlint.config.ts"));
    await cp(join(root, "apps/api/oxlint.config.ts"), join(temporary, "apps/api/oxlint.config.ts"));
    await symlink(join(root, "node_modules"), join(temporary, "node_modules"));
    await symlink(join(root, "apps/api/node_modules"), join(temporary, "apps/api/node_modules"));
    for (const scenario of cases) {
      const file = join(temporary, "apps/api/src", scenario.path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, scenario.imports.join("\n"));
    }

    // When: モックではなく、導入済みOxlintで全fixtureを一度に検査する。
    const result = spawnSync(
      "bunx",
      [
        "--no-install",
        "oxlint",
        "--format",
        "json",
        ...cases.map((scenario) => `apps/api/src/${scenario.path}`),
      ],
      {
        cwd: temporary,
        encoding: "utf8",
        timeout: 30_000,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const output = z
      .object({
        diagnostics: z.array(
          z.object({
            code: z.string(),
            filename: z.string(),
            labels: z.array(z.object({ span: z.object({ line: z.number() }) })),
          }),
        ),
      })
      .parse(JSON.parse(result.stdout));

    // Then: 禁止経路だけを検出し、正規の入口とtype-only依存を拒否しない。
    for (const scenario of cases) {
      const lines = output.diagnostics
        .filter(
          (item) =>
            (item.code === "eslint(no-restricted-imports)" ||
              item.code.startsWith("boundaries(")) &&
            item.filename.endsWith(`/src/${scenario.path}`),
        )
        .flatMap((item) => item.labels.map((label) => label.span.line));
      expect({ path: scenario.path, lines: [...new Set(lines)].sort((a, b) => a - b) }).toEqual({
        path: scenario.path,
        lines: scenario.rejectedLines,
      });
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
