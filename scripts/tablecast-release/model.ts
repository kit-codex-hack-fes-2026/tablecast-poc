import { z } from "zod";

export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const pullSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  html_url: z.string().url(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
  head: z.object({
    sha: shaSchema,
    ref: z.string(),
    repo: z.object({ full_name: z.string() }).nullable(),
  }),
  base: z.object({ ref: z.string(), sha: shaSchema }),
});

export type Pull = z.infer<typeof pullSchema>;

export type ReleaseChange = { message: string; pulls: Pull[]; sha: string };

export type ReleaseInput = {
  base: string;
  changes: ReleaseChange[];
  head: string;
  validation: string;
};
