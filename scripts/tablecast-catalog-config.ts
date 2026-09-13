import { z } from "zod";
import { deploymentTarget, tablecastRepository } from "./tablecast-deploy-config";

export const catalogKinds = ["storybook", "email"] as const;
export type CatalogKind = (typeof catalogKinds)[number];
export const catalogReleaseSchema = z.object({
  repository: z.literal(tablecastRepository),
  pr: z
    .string()
    .regex(/^[1-9]\d{0,8}$/)
    .nullable(),
  kind: z.enum(catalogKinds),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  paths: z.array(z.string().startsWith("/")).min(1),
});
export function catalogTarget(pr: string, kind: CatalogKind) {
  deploymentTarget(pr);
  const name = `tablecast-${kind}-pr-${pr}`;
  return { name, origin: `https://${name}.kit-codex.workers.dev` };
}
export function catalogRelease(kind: CatalogKind, paths: string[]) {
  return catalogReleaseSchema.parse({
    repository: tablecastRepository,
    pr: process.env.TABLECAST_PR_NUMBER || null,
    kind,
    sha: process.env.TABLECAST_RELEASE_SHA,
    paths,
  });
}
