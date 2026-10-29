import { z } from "zod";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { requireManagerRead } from "../auth/policy";
import { withImageAssets } from "../media/queries";
import { skillArchiveFilesSchema, skillArchiveImportSchema } from "./knowledge-archive";
import { knowledgeEditSchema, knowledgeLintPage } from "./knowledge-files";
import { storeSkillsSchema } from "./knowledge-model";
import {
  editDraftKnowledge,
  exportKnowledge,
  importDraftKnowledge,
  importKnowledgeFiles,
  knowledgeSource,
  knowledgeSummary,
  readKnowledgeFile,
} from "./knowledge-service";
import { storeOnboarding } from "./onboarding";

const sourceQuery = z.object({ draftId: z.string().optional(), skillId: z.string().optional() });
export const knowledgeAdminRoutes = apiFactory
  .createApp()
  .get("/onboarding", validateQuery(z.object({ draftId: z.string().optional() })), async (c) => {
    const draftId = c.req.valid("query").draftId;
    const source = await knowledgeSource(c.var.services, c.var.actor, draftId);
    return c.json(
      storeOnboarding(source.configuration, c.var.actor.storeId, source.version, draftId),
      200,
    );
  })
  .get("/knowledge", validateQuery(sourceQuery), async (c) => {
    const source = await knowledgeSource(c.var.services, c.var.actor, c.req.valid("query").draftId);
    return c.json(
      {
        version: source.version,
        skills: knowledgeSummary(source.configuration.cast.skills ?? []),
        ...knowledgeLintPage(source.configuration.cast.skills ?? []),
      },
      200,
    );
  })
  .post(
    "/knowledge/import",
    validate(skillArchiveFilesSchema.extend({ skills: storeSkillsSchema })),
    async (c) => {
      const { skills, ...input } = c.req.valid("json");
      return c.json(
        { skills: await importKnowledgeFiles(c.var.services, c.var.actor, skills, input) },
        200,
      );
    },
  )
  .post("/knowledge/archive", validate(z.object({ skills: storeSkillsSchema })), async (c) => {
    const archive = await exportKnowledge(
      c.var.services,
      c.var.actor,
      undefined,
      undefined,
      c.req.valid("json").skills,
    );
    return new Response(archive.bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="tablecast-skills.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  })
  .get(
    "/knowledge/file",
    validateQuery(
      sourceQuery.extend({
        skillId: z.string(),
        path: z.string(),
        offset: z.coerce.number().int().min(0).max(32000).default(0),
        expectedVersion: z.coerce.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("query");
      return c.json(await readKnowledgeFile(c.var.services, c.var.actor, input), 200);
    },
  )
  .get("/knowledge/archive", validateQuery(sourceQuery), async (c) => {
    const input = c.req.valid("query");
    const archive = await exportKnowledge(
      c.var.services,
      c.var.actor,
      input.draftId,
      input.skillId,
    );
    return new Response(archive.bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="tablecast-skills.zip"',
        "Cache-Control": "private, no-store",
      },
    });
  })
  .post(
    "/knowledge/lint",
    validateQuery(
      sourceQuery.extend({
        offset: z.coerce.number().int().min(0).max(100000).default(0),
        expectedVersion: z.coerce.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      requireManagerRead(c.var.actor);
      const { draftId, offset, expectedVersion } = c.req.valid("query");
      const source = await knowledgeSource(c.var.services, c.var.actor, draftId);
      ensure(offset === 0 || expectedVersion !== undefined, "KNOWLEDGE_VERSION_REQUIRED", 422);
      ensure(
        expectedVersion === undefined || expectedVersion === source.version,
        "KNOWLEDGE_VERSION_STALE",
        409,
      );
      return c.json(
        {
          version: source.version,
          ...knowledgeLintPage(source.configuration.cast.skills ?? [], offset),
        },
        200,
      );
    },
  )
  .post(
    "/drafts/:id/knowledge",
    validate(
      z.object({ expectedVersion: z.number().int().positive(), action: knowledgeEditSchema }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      return c.json(
        await withImageAssets(
          c.var.services,
          await editDraftKnowledge(
            c.var.services,
            c.var.actor,
            c.req.param("id"),
            input.expectedVersion,
            input.action,
          ),
        ),
        200,
      );
    },
  )
  .post("/drafts/:id/knowledge/import", validate(skillArchiveImportSchema), async (c) =>
    c.json(
      await withImageAssets(
        c.var.services,
        await importDraftKnowledge(
          c.var.services,
          c.var.actor,
          c.req.param("id"),
          c.req.valid("json"),
        ),
      ),
      200,
    ),
  );
