import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { z } from "zod";
import { parseSkillArchive, zipSkillArchive } from "../src/modules/configuration/knowledge-archive";
import { getDraft } from "../src/modules/configuration/queries";
import { createApiServices } from "../src/platform/context";
import { configDraftSchema } from "../src/schema";
import { setupFixture } from "./fixture";
import { authorise, connect, origin, post, toolData, toolError } from "./mcp-configuration-fixture";
const savedSchema = z.object({
  draftId: z.string(),
  version: z.number(),
  skills: z.array(z.object({ id: z.string() })),
  issues: z.array(z.unknown()).optional(),
});
const skill = {
  id: "restaurant",
  files: [
    {
      path: "SKILL.md",
      content:
        "---\nname: restaurant\ndescription: 店舗の営業時間\n---\n営業時間は参照資料を確認する。",
    },
  ],
};

it("MCPとGUIが同じ下書きでファイルCRUD・lint・版競合を扱い、公開版を保持する", async () => {
  const { cookie, staff } = await setupFixture();
  const client = await connect((await authorise(cookie)).token);
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  let saved = toolData(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        action: { type: "create-skill", skill },
      },
    }),
    savedSchema,
  );
  const response = await post(
    `/api/admin/stores/${staff.storeId}/drafts/${draft.id}/knowledge`,
    {
      expectedVersion: saved.version,
      action: {
        type: "put-file",
        skillId: skill.id,
        file: { path: "references/visit.md", content: "17時開店" },
      },
    },
    { Cookie: cookie },
  );
  expect(response.status).toBe(200);
  draft = configDraftSchema.parse(await response.json());
  const read = toolData(
    await client.callTool({
      name: "read_store_skill_file",
      arguments: { draftId: draft.id, skillId: skill.id, path: "references/visit.md" },
    }),
    z.object({ content: z.string(), version: z.number() }),
  );
  expect(read).toEqual({ content: "17時開店", version: draft.version });
  toolError(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: saved.version,
        action: { type: "delete-skill", skillId: skill.id },
      },
    }),
    "DRAFT_CONFLICT",
  );
  saved = toolData(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        action: {
          type: "rename-file",
          skillId: skill.id,
          path: "references/visit.md",
          newPath: "references/hours.md",
        },
      },
    }),
    savedSchema,
  );
  saved = toolData(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: saved.version,
        action: { type: "rename-skill", skillId: skill.id, newId: "store-guide" },
      },
    }),
    savedSchema,
  );
  const lint = toolData(
    await client.callTool({ name: "lint_store_skills", arguments: { draftId: draft.id } }),
    z.object({ issues: z.array(z.unknown()) }),
  );
  expect(lint.issues).toEqual([]);
  const published = toolData(
    await client.callTool({ name: "list_store_skills", arguments: {} }),
    z.object({ skills: z.array(z.unknown()) }),
  );
  expect(published.skills).toEqual([]);
  toolError(
    await client.callTool({
      name: "read_store_skill_file",
      arguments: { draftId: draft.id, skillId: "store-guide", offset: 1 },
    }),
    "KNOWLEDGE_VERSION_REQUIRED",
  );
  toolError(
    await client.callTool({
      name: "read_store_skill_file",
      arguments: {
        draftId: draft.id,
        skillId: "store-guide",
        offset: 1,
        expectedVersion: saved.version - 1,
      },
    }),
    "KNOWLEDGE_VERSION_STALE",
  );
  toolError(
    await client.callTool({
      name: "lint_store_skills",
      arguments: { draftId: draft.id, offset: 50 },
    }),
    "KNOWLEDGE_VERSION_REQUIRED",
  );
  toolError(
    await client.callTool({
      name: "lint_store_skills",
      arguments: { draftId: draft.id, offset: 50, expectedVersion: saved.version - 1 },
    }),
    "KNOWLEDGE_VERSION_STALE",
  );
  const before = saved.version;
  toolError(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: before,
        action: { type: "delete-file", skillId: "store-guide", path: "SKILL.md" },
      },
    }),
    "KNOWLEDGE_SKILL_REQUIRED",
  );
  expect((await getDraft(createApiServices(env), staff, draft.id)).version).toBe(before);
});

it("MCPのZIPをresourceから実ファイルとして取得し、GUI取込も同じ検査を通る", async () => {
  const { cookie, staff } = await setupFixture();
  const client = await connect((await authorise(cookie)).token);
  const draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const bytes = zipSkillArchive([skill], new Map());
  const saved = toolData(
    await client.callTool({
      name: "import_store_skills",
      arguments: { draftId: draft.id, expectedVersion: draft.version, data: bytes.toBase64() },
    }),
    savedSchema,
  );
  const exported = await client.callTool({
    name: "export_store_skills",
    arguments: { draftId: draft.id },
  });
  const link = exported.content;
  const resourceLink = z
    .array(z.object({ type: z.literal("resource_link"), uri: z.string() }))
    .parse(link)[0];
  expect(resourceLink).toBeDefined();
  const resource = await client.readResource({ uri: resourceLink?.uri ?? "" });
  const blob =
    z
      .object({
        contents: z.array(z.object({ blob: z.string(), mimeType: z.literal("application/zip") })),
      })
      .parse(resource).contents[0]?.blob ?? "";
  expect(parseSkillArchive(Uint8Array.fromBase64(blob)).skills).toEqual([skill]);
  const imported = await post(
    `/api/admin/stores/${staff.storeId}/knowledge/import`,
    { skills: [], data: blob },
    { Cookie: cookie },
  );
  expect(imported.status).toBe(200);
  expect(await imported.json()).toEqual({ skills: [skill] });
  toolError(
    await client.callTool({
      name: "import_store_skills",
      arguments: { draftId: draft.id, expectedVersion: saved.version, data: bytes.toBase64() },
    }),
    "KNOWLEDGE_SKILL_EXISTS",
  );
  expect((await getDraft(createApiServices(env), staff, draft.id)).version).toBe(saved.version);
  const invalid = zipSkillArchive(
    [{ ...skill, files: [{ path: "SKILL.md", content: "frontmatterなし" }] }],
    new Map(),
  );
  toolError(
    await client.callTool({
      name: "import_store_skills",
      arguments: {
        draftId: draft.id,
        expectedVersion: saved.version,
        data: invalid.toBase64(),
        replaceExisting: true,
      },
    }),
    "KNOWLEDGE_LINT_FAILED",
  );
  expect(
    (await getDraft(createApiServices(env), staff, draft.id)).configuration.cast.skills,
  ).toEqual([skill]);
});

it("Skill lintのエラーは公開前検証を止め、オンボーディングとGUIへ同じ不足を返す", async () => {
  const { cookie, staff } = await setupFixture();
  const client = await connect((await authorise(cookie)).token);
  const draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const saved = toolData(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        action: {
          type: "create-skill",
          skill: {
            ...skill,
            files: [
              {
                path: "SKILL.md",
                content:
                  "---\nname: wrong\ndescription: 店舗資料\n---\n[予約](references/missing.md)",
              },
            ],
          },
        },
      },
    }),
    savedSchema,
  );
  const validated = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: saved.version },
    }),
    configDraftSchema,
  );
  expect(validated.status).toBe("draft");
  expect(validated.errors).toContainEqual(
    expect.objectContaining({
      code: "KNOWLEDGE_INVALID",
      params: { skillId: "restaurant", file: "SKILL.md", issue: "NAME_MISMATCH" },
    }),
  );
  const onboarding = toolData(
    await client.callTool({ name: "get_store_onboarding", arguments: { draftId: draft.id } }),
    z.object({
      steps: z.array(z.object({ id: z.string(), status: z.string() })),
      issues: z.array(z.unknown()),
    }),
  );
  expect(onboarding.steps).toContainEqual({ id: "knowledge", status: "invalid" });
  const response = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores/${staff.storeId}/onboarding?draftId=${draft.id}`, {
      headers: { Cookie: cookie },
    }),
  );
  const gui = z.object({ issues: z.array(z.unknown()) }).parse(await response.json());
  expect(gui.issues).toEqual(onboarding.issues);
});

it("読取scopeは公開資料を読めても更新できず、他店舗resourceを取得できない", async () => {
  const { cookie } = await setupFixture();
  const writer = await connect((await authorise(cookie)).token);
  const draft = toolData(
    await writer.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const client = await connect((await authorise(cookie, "tablecast:read")).token);
  toolError(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        action: { type: "create-skill", skill },
      },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  toolError(
    await client.callTool({
      name: "import_store_skills",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        data: zipSkillArchive([skill], new Map()).toBase64(),
      },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  await expect(
    client.readResource({ uri: "tablecast://stores/other/skills/published/all.zip" }),
  ).rejects.toThrow("STORE_FORBIDDEN");
});

it("同じ保存画像をPNGとWebPで参照してもZIPの各拡張子・出所を保持して再取込できる", async () => {
  const { cookie } = await setupFixture();
  const client = await connect((await authorise(cookie)).token);
  const draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const image = toolData(
    await client.callTool({
      name: "upload_image",
      arguments: {
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
        mimeType: "image/png",
        imageKind: "photograph",
        imageSource: { generated: false, description: "店主の客席写真" },
      },
    }),
    z.object({
      imageKey: z.string(),
      imageKind: z.literal("photograph"),
      imageSource: z.object({ generated: z.boolean(), description: z.string() }),
    }),
  );
  const withImages = {
    ...skill,
    files: [
      ...skill.files,
      { path: "assets/seat.png", ...image, alt: "客席PNG" },
      { path: "assets/seat.webp", ...image, alt: "客席WebP" },
    ],
  };
  const saved = toolData(
    await client.callTool({
      name: "edit_store_skill",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        action: { type: "create-skill", skill: withImages },
      },
    }),
    savedSchema,
  );
  const exported = await client.callTool({
    name: "export_store_skills",
    arguments: { draftId: draft.id },
  });
  const uri = z.array(z.object({ uri: z.string() })).parse(exported.content)[0]?.uri ?? "";
  const resource = z
    .object({ contents: z.array(z.object({ blob: z.string() })) })
    .parse(await client.readResource({ uri }));
  const data = resource.contents[0]?.blob ?? "";
  const archive = parseSkillArchive(Uint8Array.fromBase64(data));
  expect(archive.images.find((file) => file.path.endsWith(".png"))?.bytes.slice(0, 4)).toEqual(
    new Uint8Array([137, 80, 78, 71]),
  );
  expect(
    new TextDecoder().decode(
      archive.images.find((file) => file.path.endsWith(".webp"))?.bytes.slice(0, 4),
    ),
  ).toBe("RIFF");
  const imported = toolData(
    await client.callTool({
      name: "import_store_skills",
      arguments: { draftId: draft.id, expectedVersion: saved.version, data, replaceExisting: true },
    }),
    savedSchema,
  );
  const restored = toolData(
    await client.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    configDraftSchema,
  );
  expect(restored.version).toBe(imported.version);
  expect(restored.configuration.cast.skills?.[0]?.files).toContainEqual(
    expect.objectContaining({
      path: "assets/seat.png",
      imageSource: image.imageSource,
      alt: "客席PNG",
    }),
  );
});
