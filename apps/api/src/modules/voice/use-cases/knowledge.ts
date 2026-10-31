import type { z } from "zod";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type {
  knowledgeReadSchema,
  knowledgeSearchSchema,
} from "../../configuration/knowledge-model";
import { ensure } from "../../../platform/errors";
import { getCatalog } from "../../catalog/queries";
import { readStoreSkill, searchStoreSkills } from "../../configuration/knowledge";
import { getSession } from "../../tables/queries";

export async function searchStoreKnowledge(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof knowledgeSearchSchema>,
) {
  await getSession(services, actor);
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  ensure(input.offset === 0 || input.version !== undefined, "KNOWLEDGE_VERSION_REQUIRED", 422);
  ensure(
    input.version === undefined || input.version === catalog.version,
    "KNOWLEDGE_VERSION_STALE",
    409,
  );
  return {
    version: catalog.version,
    source: actor.demoId ? "demo-store-skills" : "published-store-skills",
    ...searchStoreSkills(catalog.configuration.cast.skills ?? [], input.query, input.offset),
  };
}

export async function readStoreKnowledge(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof knowledgeReadSchema>,
) {
  await getSession(services, actor);
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  ensure(input.version === catalog.version, "KNOWLEDGE_VERSION_STALE", 409);
  const file = readStoreSkill(
    catalog.configuration.cast.skills ?? [],
    input.skillId,
    input.path,
    input.offset,
  );
  ensure(file, "KNOWLEDGE_FILE_NOT_FOUND", 404);
  return {
    version: catalog.version,
    source: actor.demoId ? "demo-store-skills" : "published-store-skills",
    ...file,
  };
}
