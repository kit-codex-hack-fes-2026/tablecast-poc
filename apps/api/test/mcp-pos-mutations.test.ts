import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { member } from "../src/db/identity-schema";
import { posConnections } from "../src/db/pos-schema";
import { configDrafts, stores } from "../src/db/table-schema";
import { configurationSchema } from "../src/modules/configuration/model";
import { createDraft } from "../src/modules/configuration/use-cases/drafts";
import { posSettingsSchema } from "../src/modules/pos/model";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { configuration, setupFixture } from "./fixture";
import {
  authorisePos,
  connectPos,
  posLocalPage as localPage,
  posMappings as mappings,
  posCatalogHttp,
  posToolData,
  posToolError,
} from "./mcp-pos-fixture";
import {
  checkoutPath,
  configured,
  deviceId,
  posConfiguration,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

it("未接続の状態と設定GUIを読取りscopeで返し、保存scopeと現行roleをMCPで検証する", async () => {
  const { cookie } = await setupFixture();
  const token = await authorisePos(cookie, "tablecast:read");
  const client = await connectPos(token);
  const outgoing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("外部要求は不要"));
  const page = posToolData(
    await client.callTool({ name: "get_pos_settings", arguments: { limit: 1 } }),
    localPage,
  );
  expect(page).toMatchObject({
    configured: false,
    connection: null,
    storeId: "tablecast-store",
    settingsUrl: "http://localhost:3000/admin/stores/tablecast-store/pos",
    total: 4,
  });
  expect(page.items).toHaveLength(1);
  expect(page.nextCursor).not.toBeNull();
  const tools = (await client.listTools()).tools;
  for (const name of ["get_pos_settings", "get_pos_catalog", "list_pos_devices"])
    expect(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint).toBe(true);
  expect(tools.find((tool) => tool.name === "save_pos_mappings")?.annotations?.readOnlyHint).toBe(
    false,
  );
  for (const name of ["start_pos_checkout", "disconnect_pos", "start_pos_oauth"])
    expect(tools.map((tool) => tool.name)).not.toContain(name);
  posToolError(
    await client.callTool({ name: "get_pos_catalog", arguments: {} }),
    "POS_CONNECTION_REQUIRED",
  );
  posToolError(
    await client.callTool({ name: "list_pos_devices", arguments: {} }),
    "POS_CONNECTION_REQUIRED",
  );
  posToolError(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: { draftId: "draft", expectedVersion: 1, connectionId: "connection", mappings },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  posToolError(
    await client.callTool({
      name: "save_pos_connection_settings",
      arguments: { expectedRevision: 1, locationId: "square-location", deviceId },
    }),
    "WRITE_SCOPE_REQUIRED",
  );
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.id, "tablecast-member"));
  for (const name of ["get_pos_settings", "get_pos_catalog", "list_pos_devices"])
    posToolError(await client.callTool({ name, arguments: {} }), "ADMIN_REQUIRED");
  expect((await request("/api/admin/stores/tablecast-store/pos", cookie)).status).toBe(200);
  expect(outgoing).not.toHaveBeenCalled();
});

it("書込scopeで下書きの全対応を保存し、古い版・無効ID・所属外店舗を拒否する", async () => {
  const { cookie, staff } = await setupPosFixture();
  const token = await authorisePos(cookie);
  const client = await connectPos(token, configured());
  posCatalogHttp();
  const draft = await createDraft(createApiServices(configured()), staff);
  const input = {
    draftId: draft.id,
    expectedVersion: draft.version,
    connectionId: "tablecast-pos-connection",
    mappings,
  };
  const saved = posToolData(
    await client.callTool({ name: "save_pos_mappings", arguments: input }),
    z.object({
      connection: posSettingsSchema.shape.connection,
      mappingCount: z.number(),
      draft: posSettingsSchema.shape.draft,
      storeId: z.string(),
      settingsUrl: z.string(),
    }),
  );
  expect(saved).toMatchObject({
    connection: { revision: 1 },
    mappingCount: 4,
    draft: { id: draft.id, version: 2 },
  });
  const draftPage = posToolData(
    await client.callTool({
      name: "get_pos_settings",
      arguments: { draftId: draft.id, section: "mappings", limit: 100 },
    }),
    localPage,
  );
  expect(draftPage).toMatchObject({
    publishedVersion: 1,
    draft: { id: draft.id, version: 2, baseVersion: 1 },
    mappingConnectionId: "tablecast-pos-connection",
  });
  expect(draftPage.mappings).toEqual(expect.arrayContaining(mappings));
  const row = await fixtureDb.select().from(posConnections).get();
  expect(
    configurationSchema.parse(
      JSON.parse((await fixtureDb.select().from(configDrafts).get())?.config_json ?? "{}"),
    ).pos?.mappings,
  ).toEqual(mappings);
  expect(
    configurationSchema.parse(
      JSON.parse(
        (await fixtureDb.select().from(stores).where(eq(stores.id, "tablecast-store")).get())
          ?.config_json ?? "{}",
      ),
    ).pos?.mappings,
  ).toEqual(posConfiguration.pos.mappings);
  expect(JSON.stringify(saved)).not.toContain("tablecast-square-access-token");
  expect(JSON.stringify(saved)).not.toContain(row?.credentials);
  posToolError(
    await client.callTool({ name: "save_pos_mappings", arguments: input }),
    "DRAFT_CONFLICT",
  );
  posToolError(
    await client.callTool({
      name: "save_pos_mappings",
      arguments: {
        ...input,
        expectedVersion: 2,
        mappings: [{ kind: "product", localId: "tea", externalId: "missing" }],
      },
    }),
    "POS_MAPPING_REQUIRED",
  );
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(row);
  await fixtureDb.batch([
    fixtureDb.insert(member).values({
      id: "tablecast-other-pos-admin",
      organizationId: "tablecast-fixture-other-org",
      userId: staff.userId,
      role: "owner",
      createdAt: new Date(),
    }),
    fixtureDb.insert(stores).values({
      id: "tablecast-other-pos-store",
      organization_id: "tablecast-fixture-other-org",
      name: "他店舗",
      config_json: JSON.stringify(configuration),
      updated_at: Date.now(),
    }),
  ]);
  await expect(connectPos(token, configured(), "tablecast-other-pos-store")).rejects.toMatchObject({
    code: 403,
  });
});

it("MCPのlive設定保存でも処理中の会計と店舗端末を変更しない", async () => {
  const { cookie, table } = await setupPosFixture();
  const client = await connectPos(await authorisePos(cookie), configured());
  squareHttp();
  const started = await request(checkoutPath + "/start", cookie, "POST", {
    expectedVersion: table.cart.version,
    idempotencyKey: "tablecast-mcp-pos-lock",
  });
  expect(started.status).toBe(200);
  const before = await fixtureDb.select().from(posConnections).get();
  posToolError(
    await client.callTool({
      name: "save_pos_connection_settings",
      arguments: {
        expectedRevision: 1,
        locationId: "square-location",
        deviceId,
      },
    }),
    "POS_VERSION_CONFLICT",
  );
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(before);
});
