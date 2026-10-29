import { expect, it } from "vitest";
import { z } from "zod";
import { catalogSchema, configDraftSchema } from "../src/schema";
import { setupFixture } from "./fixture";
import { foodProduct } from "./food-fixture";
import { authorise, connect, toolData, toolError } from "./mcp-configuration-fixture";

it("MCPで日本の分類と具材の増減を設定し、根拠と参照を往復保存する", async () => {
  const { cookie } = await setupFixture();
  const { token } = await authorise(cookie);
  const client = await connect(token);
  const published = toolData(
    await client.callTool({ name: "get_configuration", arguments: {} }),
    catalogSchema.extend({
      foodClassification: z.object({
        version: z.literal("jp-2026-04"),
        allergens: z.array(z.object({ id: z.string(), category: z.string() })),
      }),
    }),
  );
  expect(published.foodClassification.allergens).toHaveLength(29);
  let draft = toolData(
    await client.callTool({ name: "create_draft", arguments: {} }),
    configDraftSchema,
  );
  const configuration = { ...draft.configuration, products: [foodProduct()] };
  const base = configuration.products[0]?.foodInfo.base;
  if (!base) throw new Error("食事情報がありません");
  base.halalCertification = "not_certified";
  base.crossContactSources = ["shared_equipment"];
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version, configuration },
    }),
    configDraftSchema,
  );
  const saved = toolData(
    await client.callTool({ name: "get_draft_diff", arguments: { draftId: draft.id } }),
    configDraftSchema,
  );
  expect(saved.configuration.products).toEqual(configuration.products);
  expect(saved.changes.some((change) => change.sensitive && change.path.includes("foodInfo"))).toBe(
    true,
  );
  const ready = toolData(
    await client.callTool({
      name: "validate_draft",
      arguments: { draftId: draft.id, expectedVersion: draft.version },
    }),
    configDraftSchema,
  );
  expect(ready.errors).toEqual([]);
  const option = configuration.products[0]?.modifiers[0]?.options[0];
  if (!option) throw new Error("食事制限の選択肢がありません");
  delete option.foodChanges;
  toolError(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: ready.version, configuration },
    }),
    "CONFIGURATION_FORMAT_UNSUPPORTED",
  );
  option.foodChanges = { add: [], remove: [] };
  draft = toolData(
    await client.callTool({
      name: "update_draft",
      arguments: { draftId: draft.id, expectedVersion: ready.version, configuration },
    }),
    configDraftSchema,
  );
  expect(draft.configuration.products[0]?.modifiers[0]?.options[0]?.foodChanges).toEqual({
    add: [],
    remove: [],
  });
});
