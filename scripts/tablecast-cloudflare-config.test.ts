import {
  getWorkerBundleDir,
  readBuildOutput,
  writeContainerConfig,
  writeRootConfig,
  writeWorkerConfig,
} from "@cloudflare/build-output-utils";
import { InputWorkerSchema, resolveAndParseConfig } from "@cloudflare/config";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { apiCloudflareConfig } from "../apps/api/cloudflare.config.ts";
import { webCloudflareConfig } from "../apps/web/cloudflare.config.ts";
import { cleanBuild } from "./tablecast-clean-build.ts";
import {
  accessApplicationConfig,
  bindDeploymentDatabase,
  deploymentBuildOutput,
  deploymentOptions,
  deploymentTarget,
  modeOptions,
  tablecastAccess,
  tablecastAccountId,
} from "./tablecast-deploy-config.ts";
import { reconcileAccess } from "./tablecast-infra-access.ts";
import { assertWorkerOwner } from "./tablecast-infra-diff.ts";

beforeEach(() => vi.stubEnv("TABLECAST_EMAIL_FROM", "tablecast@example.test"));
afterEach(() => vi.unstubAllEnvs());

describe("cfの環境解決と実資源の採用", () => {
  test.each(["preview", "staging", "production"])(
    "%sでは全Worker成果物のdotenvだけを除き、開発時と通常assetは保持する",
    async (mode) => {
      const root = await mkdtemp(join(tmpdir(), "tablecast-clean-build-test-"));
      const names = [
        ".env",
        ".env.preview",
        ".dev.vars",
        ".dev.vars.preview",
        "index.js",
        "env.json",
      ];
      try {
        for (const worker of ["default", "tablecast_api"]) {
          const directory = join(root, ".cloudflare/output/v0/workers", worker);
          await mkdir(directory, { recursive: true });
          await Promise.all(names.map((name) => writeFile(join(directory, name), name)));
          await cleanBuild(root, "development");
          expect((await readdir(directory)).sort()).toEqual([...names].sort());
        }
        await cleanBuild(root, mode);
        for (const worker of ["default", "tablecast_api"])
          expect(await readdir(join(root, ".cloudflare/output/v0/workers", worker))).toEqual([
            "env.json",
            "index.js",
          ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  test.each(["production", "staging", "preview"] as const)(
    "%sの資源・SQLite exports・secret宣言を解決する",
    async (environment) => {
      const target = deploymentTarget(environment === "preview" ? "267" : undefined, environment);
      const sha = "a".repeat(40);
      const generated = deploymentOptions(target, sha, "11111111-1111-4111-8111-111111111111");
      const config = apiCloudflareConfig({
        name: target.api,
        accountId: generated.api.accountId,
        vars: generated.api.vars,
        environment,
        database: { name: target.database, id: "11111111-1111-4111-8111-111111111111" },
        bucket: target.bucket,
      });
      const result = await resolveAndParseConfig(config, { mode: environment, isPreview: false });
      if (!result.success) throw result.error;
      expect(result.data.worker?.exports).toMatchObject({
        StoreEvents: { storage: "sqlite" },
        TablecastEmulate: { storage: "sqlite" },
      });
      expect(result.data.worker?.exports).not.toHaveProperty("TablecastVoice");
      expect(result.data.worker?.env?.TABLECAST_MODEL_API_KEY).toEqual({ type: "secret" });
      expect(result.data.containers).toHaveLength(target.emulate ? 1 : 0);
      const web = await resolveAndParseConfig(
        webCloudflareConfig({ name: target.web, api: target.api, environment }),
        { mode: environment, isPreview: false },
      );
      if (!web.success) throw web.error;
      expect(web.data.worker?.env?.TABLECAST_API).toEqual({ type: "worker", worker: target.api });
      expect(() => modeOptions("api", environment)).toThrow("配備設定");
    },
  );

  test("未対応modeと別Workerの実D1指定を拒否する", () => {
    expect(() => modeOptions("api", "prodution")).toThrow("Invalid option");
    expect(() =>
      bindDeploymentDatabase(
        { name: "tablecast-other", compatibilityDate: "2026-09-03" },
        deploymentTarget("267"),
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toThrow("別Worker");
    expect(apiCloudflareConfig({ environment: "test" }).worker.env.TABLECAST_ENV.value).toBe(
      "test",
    );
    expect(
      apiCloudflareConfig({ environment: "development" }).worker.env.TABLECAST_VOICE_ENABLED.value,
    ).toBe("false");
  });

  test("ローカルのSquare公開IDだけをAPI varsへ渡し秘密値はAPI secretとして宣言する", () => {
    const local = {
      TABLECAST_RESOURCE_NAME: "square-test",
      TABLECAST_SQUARE_APPLICATION_ID: "sandbox-sq0idb-tablecast-test",
      TABLECAST_SQUARE_ENVIRONMENT: "sandbox",
      TABLECAST_SQUARE_APPLICATION_SECRET: "tablecast-private-application-secret",
      TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY: "tablecast-private-signature-key",
      TABLECAST_POS_ENCRYPTION_SECRET: "tablecast-private-encryption-secret",
    };
    const api = modeOptions("api", "development", "", local);
    const web = modeOptions("web", "development", "", local);
    expect(api.vars.TABLECAST_SQUARE_APPLICATION_ID).toBe(local.TABLECAST_SQUARE_APPLICATION_ID);
    expect(api.vars.TABLECAST_SQUARE_ENVIRONMENT).toBe("sandbox");
    const worker = apiCloudflareConfig(api).worker;
    for (const key of [
      "TABLECAST_SQUARE_APPLICATION_SECRET",
      "TABLECAST_SQUARE_WEBHOOK_SIGNATURE_KEY",
      "TABLECAST_POS_ENCRYPTION_SECRET",
    ]) {
      expect(api.vars).not.toHaveProperty(key);
      expect(Reflect.get(worker.env, key)).toEqual({ type: "secret" });
      expect(web.vars).not.toHaveProperty(key);
    }
    expect(web.vars).not.toHaveProperty("TABLECAST_SQUARE_APPLICATION_ID");
    expect(web.vars).not.toHaveProperty("TABLECAST_SQUARE_ENVIRONMENT");
  });

  test("一つの入力から両workspaceを解決し、SDK用JSONなしでmodeの取り違えを拒否する", () => {
    const target = deploymentTarget("267");
    const options = deploymentOptions(
      target,
      "a".repeat(40),
      "11111111-1111-4111-8111-111111111111",
    );
    const input = JSON.stringify(options);
    expect(modeOptions("api", "preview", input).name).toBe(target.api);
    expect(modeOptions("web", "preview", input).name).toBe(target.web);
    expect(() => modeOptions("api", "staging", input)).toThrow("cf modeが一致しません");
    expect(modeOptions("api", "test").environment).toBe("test");
    const local = JSON.stringify({
      api: { name: "tablecast-worktree-api", bucket: "tablecast-worktree-media" },
      web: { name: "tablecast-worktree-web", api: "tablecast-worktree-api" },
    });
    expect(modeOptions("api", "development", local).bucket).toBe("tablecast-worktree-media");
    expect(modeOptions("web", "development", local).api).toBe("tablecast-worktree-api");
  });

  test("同じAccess設定を再適用してもpolicy・tokenを再作成しない", async () => {
    const calls: string[] = [];
    const request = async (path: string, method = "GET") => {
      calls.push(`${method} ${path}`);
      if (path.startsWith("access/policies")) return tablecastAccess.policies;
      return tablecastAccess.serviceToken;
    };
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (await reconcileAccess(true, request)).every((change) => change.action === "unchanged"),
      ).toBe(true);
    expect(calls.every((call) => call.startsWith("GET "))).toBe(true);
    expect(
      accessApplicationConfig("tablecast-storybook-pr-267", "example.test", "existing-worker"),
    ).toMatchObject({ destinations: [{ type: "worker", worker_id: "existing-worker" }] });
  });

  test("既存service tokenがない場合、秘密値を作り直さず採用を拒否する", async () => {
    await expect(
      reconcileAccess(true, async (path) =>
        path.startsWith("access/policies") ? tablecastAccess.policies : undefined,
      ),
    ).rejects.toThrow("再生成せず");
  });

  test("service tokenの所有確認が未完了・不一致なら差分policyも更新しない", async () => {
    const token = Promise.withResolvers<unknown>();
    const writes: string[] = [];
    const result = reconcileAccess(true, async (path, method = "GET") => {
      if (method !== "GET") {
        writes.push(path);
        return undefined;
      }
      if (path.startsWith("access/policies"))
        return tablecastAccess.policies.map((policy) => ({ ...policy, include: [] }));
      return token.promise;
    });
    await Promise.resolve();
    expect(writes).toEqual([]);
    token.resolve({ ...tablecastAccess.serviceToken, name: "other-token" });
    await expect(result).rejects.toThrow("採用済みservice tokenがありません");
    expect(writes).toEqual([]);
  });

  test("公式Build Outputを読み、別環境・別SHA・別PR・秘密値の混入を配備前に拒否する", async () => {
    vi.stubEnv("TABLECAST_SQUARE_APPLICATION_ID", "sq0idp-tablecast-test");
    const root = await mkdtemp(join(tmpdir(), "tablecast-build-output-test-"));
    const target = deploymentTarget("267");
    const sha = "a".repeat(40);
    const generated = deploymentOptions(target, sha, "11111111-1111-4111-8111-111111111111");
    try {
      await writeRootConfig(
        root,
        { accountId: tablecastAccountId },
        { mode: "preview", isPreview: false },
      );
      for (const [directoryName, authored] of [
        [
          "tablecast_api",
          apiCloudflareConfig({
            environment: "preview",
            name: target.api,
            accountId: tablecastAccountId,
            vars: generated.api.vars,
            database: { name: target.database, id: "11111111-1111-4111-8111-111111111111" },
            bucket: target.bucket,
          }),
        ],
        [
          "default",
          webCloudflareConfig({
            environment: "preview",
            name: target.web,
            api: target.api,
            vars: generated.web.vars,
          }),
        ],
      ] as const) {
        const result = await resolveAndParseConfig(authored, { mode: "preview", isPreview: false });
        if (!result.success) throw result.error;
        await mkdir(getWorkerBundleDir(root, directoryName), { recursive: true });
        await writeFile(
          join(getWorkerBundleDir(root, directoryName), "index.js"),
          "export default {fetch(){return new Response('TableCast')}}",
        );
        await writeWorkerConfig({
          root,
          directoryName,
          config: InputWorkerSchema.parse(result.data.worker),
          manifest: {
            type: "complete",
            mainModule: "index.js",
            modules: { "index.js": { type: "esm" } },
          },
        });
        for (const container of result.data.containers ?? []) {
          if (!("image" in container)) throw new Error("標準Containerのimageがありません。");
          await writeContainerConfig({
            root,
            directoryName: container.name,
            config: {
              ...container,
              image: {
                reference: `registry.cloudflare.com/${tablecastAccountId}/tablecast-emulate:${sha}`,
              },
            },
          });
        }
      }
      const bundle = getWorkerBundleDir(root, "default");
      await writeFile(join(bundle, ".env.preview"), "tablecast-build-test-secret");
      execFileSync(process.execPath, [resolve(import.meta.dirname, "tablecast-clean-build.ts")], {
        cwd: root,
      });
      expect(await readdir(bundle)).not.toContain(".env.preview");
      const output = await readBuildOutput(root);
      expect(deploymentBuildOutput(output, target, sha)).toHaveLength(2);
      vi.stubEnv("TABLECAST_SQUARE_APPLICATION_ID", "sq0idp-other-application");
      expect(() => deploymentBuildOutput(output, target, sha)).toThrow("Square設定");
      vi.stubEnv("TABLECAST_SQUARE_APPLICATION_ID", "sq0idp-tablecast-test");
      const web = output.workers.default;
      if (!web?.config.env) throw new Error("Webのenvがありません。");
      web.config.env.TABLECAST_SQUARE_APPLICATION_ID = {
        type: "text",
        value: "sq0idp-tablecast-test",
      };
      expect(() => deploymentBuildOutput(output, target, sha)).toThrow("Web Worker");
      delete web.config.env.TABLECAST_SQUARE_APPLICATION_ID;
      expect(() => deploymentBuildOutput(output, target, "b".repeat(40))).toThrow("Invalid input");
      expect(() =>
        deploymentBuildOutput(output, deploymentTarget(undefined, "staging"), sha),
      ).toThrow("mode");
      expect(() => deploymentBuildOutput(output, deploymentTarget("268"), sha)).toThrow(
        "Worker成果物",
      );
      const api = output.workers.tablecast_api;
      if (!api?.config.env) throw new Error("APIのenvがありません。");
      api.config.env.TABLECAST_SQUARE_ENVIRONMENT = { type: "text", value: "sandbox" };
      expect(() => deploymentBuildOutput(output, target, sha)).toThrow("Square設定");
      api.config.env.TABLECAST_SQUARE_ENVIRONMENT = { type: "text", value: "production" };
      api.config.env.TABLECAST_AUTH_SECRET = {
        type: "text",
        value: "tablecast-secret-must-never-enter-artifact",
      };
      expect(() => deploymentBuildOutput(output, target, sha)).toThrow("Invalid input");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("別環境・別PR・所有D1の異なるWorkerを変更・削除対象へ採用しない", () => {
    const target = deploymentTarget("267");
    const actual = {
      bindings: [
        { name: "TABLECAST_ENV", type: "plain_text", text: "preview" },
        { name: "TABLECAST_PR_NUMBER", type: "plain_text", text: "267" },
        { name: "TABLECAST_DB", type: "d1", id: "owned-database" },
        {
          name: "TABLECAST_EVENTS",
          type: "durable_object_namespace",
          class_name: "StoreEvents",
          namespace_id: "owned-namespace",
        },
      ],
    };
    expect(() => assertWorkerOwner(actual, target, true, "owned-database")).not.toThrow();
    expect(() => assertWorkerOwner(actual, deploymentTarget("268"), false)).toThrow("対象外");
    expect(() => assertWorkerOwner(actual, deploymentTarget(undefined, "staging"), false)).toThrow(
      "対象外",
    );
    expect(() => assertWorkerOwner(actual, target, true, "other-database")).toThrow("別のD1");
    expect(() =>
      assertWorkerOwner(actual, target, true, "owned-database", [
        { id: "owned-namespace", class: "StoreEvents" },
      ]),
    ).not.toThrow();
    expect(() =>
      assertWorkerOwner(actual, target, true, "owned-database", [
        { id: "other-namespace", class: "StoreEvents" },
      ]),
    ).toThrow("別のDO");
  });
});
