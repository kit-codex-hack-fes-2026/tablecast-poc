import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";
import { deploymentTarget } from "../tablecast-deploy-config.ts";

export const root = resolve(import.meta.dirname, "../..");

export const directory = resolve(root, ".local/tablecast-deploy");

export const target = deploymentTarget(
  process.env.TABLECAST_PR_NUMBER || undefined,
  z.enum(["production", "staging", "preview"]).parse(process.env.TABLECAST_DEPLOY_ENV),
);

export const sha = process.env.TABLECAST_RELEASE_SHA ?? "";

export const databaseSchema = z.object({ uuid: z.uuid(), name: z.string() });

export const accessSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().optional(),
  destinations: z.array(z.object({ type: z.string(), uri: z.string().optional() })).optional(),
});
