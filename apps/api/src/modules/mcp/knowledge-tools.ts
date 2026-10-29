import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { ensure } from "../../platform/errors";
import { skillArchiveImportSchema } from "../configuration/knowledge-archive";
import { knowledgeEditSchema, knowledgeLintPage } from "../configuration/knowledge-files";
import {
  editDraftKnowledge,
  exportKnowledge,
  importDraftKnowledge,
  knowledgeSource,
  knowledgeSummary,
  readKnowledgeFile,
} from "../configuration/knowledge-service";
import { storeOnboarding } from "../configuration/onboarding";
import { result } from "./result";

export function registerKnowledgeTools(server: McpServer, services: ApiServices, actor: Actor) {
  server.registerTool(
    "get_store_onboarding",
    {
      description:
        "店舗全体の設定状況と不足・確認事項、対応するMCPツールと管理画面を取得する。draftIdで下書きの進捗を確認できる。設定値の存在は実店舗での事実確認や公開承認の完了を意味しない。接続と端末登録、公開は人が確認する。",
      inputSchema: { draftId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => {
      const source = await knowledgeSource(services, actor, draftId);
      return result(storeOnboarding(source.configuration, actor.storeId, source.version, draftId));
    },
  );
  server.registerTool(
    "list_store_skills",
    {
      description:
        "店舗資料のSkill・metadata・ファイルツリーとlint結果を取得する。draftIdを指定すると編集中の下書きを読む。本文はread_store_skill_fileで必要なファイルだけ取得する。",
      inputSchema: { draftId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId }) => {
      const source = await knowledgeSource(services, actor, draftId);
      const skills = source.configuration.cast.skills ?? [];
      return result({
        version: source.version,
        skills: knowledgeSummary(skills),
        ...knowledgeLintPage(skills),
      });
    },
  );
  server.registerTool(
    "read_store_skill_file",
    {
      description:
        "公開版または下書きのSkillファイルを4000文字ずつ読む。画像は出所と代替テキストを返す。続きは取得した版をexpectedVersionへ渡す。",
      inputSchema: {
        draftId: z.string().optional(),
        skillId: z.string(),
        path: z.string().default("SKILL.md"),
        offset: z.number().int().min(0).max(32000).default(0),
        expectedVersion: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId, skillId, path, offset, expectedVersion }) => {
      return result(
        await readKnowledgeFile(services, actor, {
          draftId,
          skillId,
          path,
          offset,
          expectedVersion,
        }),
      );
    },
  );
  server.registerTool(
    "edit_store_skill",
    {
      description:
        "店舗資料の下書きへSkill作成・改名・削除、ファイル作成/更新・改名・削除を行う。最新expectedVersionが必須。画像は先にupload_imageを使い返されたキーと出所をput-fileへ渡す。SKILL.md単体の削除/改名は禁止。公開は変更しない。改名後はlint_store_skillsで参照を確認する。",
      inputSchema: {
        draftId: z.string(),
        expectedVersion: z.number().int().positive(),
        action: knowledgeEditSchema,
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ draftId, expectedVersion, action }) => {
      const draft = await editDraftKnowledge(services, actor, draftId, expectedVersion, action);
      return result({
        draftId: draft.id,
        version: draft.version,
        status: draft.status,
        skills: knowledgeSummary(draft.configuration.cast.skills ?? []),
        ...knowledgeLintPage(draft.configuration.cast.skills ?? []),
      });
    },
  );
  server.registerTool(
    "lint_store_skills",
    {
      description:
        "Agent Skills仕様のSKILL.md・YAML frontmatter・name/description・名前一致、店舗資料の参照切れを検査する。警告と公開を妨げるエラーを区別する。一度に50件まで返す。nextOffsetがあればoffsetと取得版expectedVersionで続きを読む。修正後はvalidate_draftで全設定を再検証する。",
      inputSchema: {
        draftId: z.string().optional(),
        offset: z.number().int().min(0).max(100000).default(0),
        expectedVersion: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId, offset, expectedVersion }) => {
      const source = await knowledgeSource(services, actor, draftId);
      ensure(offset === 0 || expectedVersion !== undefined, "KNOWLEDGE_VERSION_REQUIRED", 422);
      ensure(
        expectedVersion === undefined || expectedVersion === source.version,
        "KNOWLEDGE_VERSION_STALE",
        409,
      );
      return result({
        version: source.version,
        ...knowledgeLintPage(source.configuration.cast.skills ?? [], offset),
      });
    },
  );
  server.registerTool(
    "import_store_skills",
    {
      description:
        "標準Skillディレクトリを持つZIPを下書きへ取り込む。ChatGPT添付はfile、他のクライアントは実ZIPのBase64をdataへ渡す。5MiBまで。同名SkillはreplaceExisting=trueを明示したときだけ置換し、他のSkillと店舗設定を保持する。画像出所manifestのないZIPに画像がある場合はimageMetadataを指定する。全体をlintし、失敗時は下書きを更新しない。公開は変更しない。",
      inputSchema: { draftId: z.string(), ...skillArchiveImportSchema.shape },
      _meta: { "openai/fileParams": ["file"] },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ draftId, ...input }) => {
      const draft = await importDraftKnowledge(services, actor, draftId, input);
      return result({
        draftId: draft.id,
        version: draft.version,
        status: draft.status,
        skills: knowledgeSummary(draft.configuration.cast.skills ?? []),
      });
    },
  );
  server.registerResource(
    "store-skills-archive",
    new ResourceTemplate("tablecast://stores/{storeId}/skills/{scope}/{selection}.zip", {
      list: undefined,
    }),
    {
      mimeType: "application/zip",
      description: "店舗資料の標準Skill ZIP。認可済みの店舗と公開版/下書きだけを配信する。",
    },
    async (uri, variables) => {
      const { storeId, scope, selection } = z
        .object({ storeId: z.string(), scope: z.string(), selection: z.string() })
        .parse(variables);
      ensure(storeId === actor.storeId, "STORE_FORBIDDEN", 403);
      const archive = await exportKnowledge(
        services,
        actor,
        scope === "published" ? undefined : scope,
        selection === "all" ? undefined : selection.replace(/^skill-/, ""),
      );
      return {
        contents: [{ uri: uri.href, mimeType: "application/zip", blob: archive.bytes.toBase64() }],
      };
    },
  );
  server.registerTool(
    "export_store_skills",
    {
      description:
        "公開版または下書きの店舗資料を画像・出所付きの標準Skill ZIPへ書き出す。skillId省略時は全Skill。返されたMCP resource_linkをresources/readで読み、実ファイルとして保存する。設定と公開版は変更しない。",
      inputSchema: { draftId: z.string().optional(), skillId: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ draftId, skillId }) => {
      const source = await knowledgeSource(services, actor, draftId);
      ensure(
        source.configuration.cast.skills?.some((skill) => !skillId || skill.id === skillId),
        "KNOWLEDGE_FILE_NOT_FOUND",
        404,
      );
      const uri = `tablecast://stores/${encodeURIComponent(actor.storeId)}/skills/${encodeURIComponent(draftId ?? "published")}/${encodeURIComponent(skillId ? `skill-${skillId}` : "all")}.zip`;
      return {
        content: [
          { type: "resource_link", uri, name: "tablecast-skills.zip", mimeType: "application/zip" },
        ],
      };
    },
  );
}
