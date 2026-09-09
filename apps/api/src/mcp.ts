import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod";
import { createAuth, type Actor, type ApiEnv } from "./auth";
import { ensure } from "./errors";
import { configurationSchema, voiceListQuerySchema } from "./schema";
import {
  createDraft,
  discardDraft,
  getDraft,
  updateDraft,
  validateDraft,
} from "./modules/configuration";
import { getCatalog } from "./modules/operations";
import { listVoices } from "./modules/voices";

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

export const mcpRoutes = new Hono<ApiEnv>().all("/", async (c) => {
  let principal;
  try {
    principal = await createAuth(c.env).api.tablecastMcpPrincipal({ headers: c.req.raw.headers });
  } catch {
    return c.json({ error: "invalid_token" }, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${c.env.TABLECAST_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    });
  }
  const rows = await c.env.TABLECAST_DB.prepare(
    "SELECT s.id,m.role FROM stores s JOIN member m ON m.organization_id=s.organization_id WHERE s.organization_id=? AND m.user_id=? ORDER BY s.id",
  )
    .bind(principal.organizationId, principal.userId)
    .all<{ id: string; role: string }>();
  const storeId = c.req.query("storeId") ?? rows.results[0]?.id;
  const row = rows.results.find((store) => store.id === storeId);
  ensure(row, "STORE_FORBIDDEN", 403);
  const actor: Actor = {
    kind: "mcp",
    storeId: row.id,
    userId: principal.userId,
    role: row.role,
    canWrite: principal.canWrite,
  };
  const server = new McpServer({ name: "tablecast-settings", version: "0.1.0" });

  server.registerTool(
    "get_configuration",
    { description: "店舗の公開設定、日英データ、入力schemaを取得する。", inputSchema: {} },
    async () =>
      result({
        ...(await getCatalog(c.env, actor.storeId)),
        schema: z.toJSONSchema(configurationSchema),
        locales: ["ja", "en"],
      }),
  );
  server.registerTool(
    "list_voices",
    {
      description:
        "指定した言語を主言語とするInworldの標準音声を取得する。次のページは返されたnextPageTokenをpageTokenへ渡して取得する。",
      inputSchema: voiceListQuerySchema.shape,
      annotations: { readOnlyHint: true },
    },
    async (input) => result(await listVoices(c.env, actor, input)),
  );
  server.registerTool(
    "create_draft",
    {
      description: "現在の公開版から変更下書きを作る。",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async () => result(await createDraft(c.env, actor)),
  );
  server.registerTool(
    "update_draft",
    {
      description:
        "カテゴリ・商品・カスタマイズ・翻訳・プラン・キャストの変更を下書きへ一括保存する。",
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int(),
        configuration: configurationSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ draftId, expectedVersion, configuration }) =>
      result(await updateDraft(c.env, actor, draftId, { expectedVersion, configuration })),
  );
  server.registerTool(
    "validate_draft",
    {
      description: "価格、参照、日英の読上げ名、プランの整合性を検証する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
    },
    async ({ draftId, expectedVersion }) =>
      result(await validateDraft(c.env, actor, draftId, expectedVersion)),
  );
  server.registerTool(
    "get_draft_diff",
    {
      description: "公開版との差分と価格・安全情報の変更箇所を取得する。",
      inputSchema: { draftId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => result(await getDraft(c.env, actor, draftId)),
  );
  server.registerTool(
    "request_publication",
    {
      description: "公開対象版と人が確認する管理画面を返す。公開は管理画面の明示承認で完了する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
    },
    async ({ draftId, expectedVersion }) => {
      const draft = await getDraft(c.env, actor, draftId);
      ensure(draft.status === "ready" && draft.version === expectedVersion, "DRAFT_NOT_READY");
      return result({
        draftId,
        version: draft.version,
        status: "human_approval_required",
        reviewUrl: `${c.env.TABLECAST_PUBLIC_ORIGIN}/admin/live?storeId=${encodeURIComponent(actor.storeId)}&draftId=${encodeURIComponent(draftId)}`,
      });
    },
  );
  server.registerTool(
    "discard_draft",
    {
      description: "不要な未公開下書きを破棄する。",
      inputSchema: { draftId: z.string(), expectedVersion: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ draftId, expectedVersion }) =>
      result(await discardDraft(c.env, actor, draftId, expectedVersion)),
  );
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});
