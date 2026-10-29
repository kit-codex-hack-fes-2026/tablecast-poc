import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { publishDraft } from "../src/modules/configuration/use-cases/publish";
import { createCastTools } from "../src/modules/voice/agent";
import { createApiServices } from "../src/platform/context";
import { catalogSchema, configDraftSchema } from "../src/schema";
import { device, setupFixture } from "./fixture";
import { authorise, connect, toolData, toolError } from "./mcp-configuration-fixture";

it("MCPの店舗資料は下書きのまま接客へ出ず、人の公開後に版付き検索・原文読取できる", async () => {
  const { cookie, staff } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const catalog = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = {
    ...catalog.configuration,
    cast: {
      ...catalog.configuration.cast,
      skills: [
        {
          id: "restaurant",
          files: [
            {
              path: "SKILL.md",
              content:
                "---\nname: restaurant\ndescription: 営業案内\n---\n[予約](references/visit.md)",
            },
            {
              path: "references/visit.md",
              content: "# 営業時間\n通常営業は17:00からです。予約はスタッフへ相談します。",
            },
          ],
        },
      ],
    },
  };
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  expect(draft.configuration.cast.skills).toEqual(configuration.cast.skills);
  const { skills: _skills, ...legacyCast } = configuration.cast;
  toolError(
    await client.callTool({
      name: "update_draft",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        configuration: { ...configuration, cast: legacyCast },
      },
    }),
    "CONFIGURATION_FORMAT_UNSUPPORTED",
  );
  expect(draft.changes.some((change) => change.path.startsWith("cast.skills"))).toBe(true);
  const services = createApiServices(env);
  const tools = createCastTools(services, device, new AbortController().signal);
  expect(await tools.searchStoreKnowledge.execute({ query: "営業時間" })).toMatchObject({
    version: 1,
    matches: [],
    total: 0,
  });
  toolError(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version - 1, configuration },
    }),
    "DRAFT_CONFLICT",
  );
  draft = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(draft.status).toBe("ready");
  await publishDraft(services, staff, draft.id, {
    expectedVersion: draft.version,
    baseVersion: draft.baseVersion,
    idempotencyKey: "tablecast-knowledge-publish",
    approved: true,
  });
  const result = await tools.searchStoreKnowledge.execute({ query: "営業時間" });
  expect(result).toMatchObject({
    version: 2,
    matches: [expect.objectContaining({ skillId: "restaurant", path: "references/visit.md" })],
  });
  expect(
    await tools.readStoreKnowledge.execute({
      skillId: "restaurant",
      path: "references/visit.md",
      version: 2,
    }),
  ).toMatchObject({
    content: configuration.cast.skills[0]?.files[1]?.content,
    version: 2,
    nextOffset: null,
  });
  await expect(
    tools.readStoreKnowledge.execute({ skillId: "restaurant", version: 1 }),
  ).rejects.toMatchObject({ code: "KNOWLEDGE_VERSION_STALE" });
  await expect(
    tools.searchStoreKnowledge.execute({ query: "予約", offset: 5 }),
  ).rejects.toMatchObject({ code: "KNOWLEDGE_VERSION_REQUIRED" });
  expect(() =>
    tools.readStoreKnowledge.execute({ skillId: "restaurant", path: "../secret", version: 2 }),
  ).toThrow("INVALID_INPUT");
  const other = createCastTools(
    services,
    { ...device, storeId: "tablecast-other-store" },
    new AbortController().signal,
  );
  await expect(other.searchStoreKnowledge.execute({ query: "営業時間" })).rejects.toMatchObject({
    code: "TABLE_NOT_FOUND",
  });
});

it("読取scopeのMCPは資料を保存できず、不正な資料を下書きへ入れない", async () => {
  const { cookie } = await setupFixture();
  const writer = await connect((await authorise(cookie)).token);
  const draft = toolData(
    await writer.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const readonly = await connect((await authorise(cookie, "tablecast:read")).token);
  const published = toolData(
    await readonly.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema,
  );
  toolError(
    await readonly.callTool({
      name: "update_draft",
      arguments: {
        draftId: draft.id,
        expectedVersion: draft.version,
        configuration: published.configuration,
      },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  const invalid = await writer.callTool({
    name: "update_draft",
    arguments: {
      draftId: draft.id,
      expectedVersion: draft.version,
      configuration: {
        ...published.configuration,
        cast: {
          ...published.configuration.cast,
          skills: [{ id: "restaurant", files: [{ path: "../SKILL.md", content: "秘密" }] }],
        },
      },
    },
  });
  expect(invalid.isError).toBe(true);
  const unchanged = toolData(
    await writer.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    configDraftSchema,
  );
  expect(unchanged.version).toBe(draft.version);
  expect(unchanged.configuration.cast.skills).toBeUndefined();
});
