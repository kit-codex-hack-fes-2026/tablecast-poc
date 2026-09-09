import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";
import { DomainError } from "./errors";
export const validate = <T extends z.ZodType>(schema: T) =>
  zValidator("json", schema, (result) => {
    if (!result.success)
      throw new DomainError(
        "INVALID_INPUT",
        422,
        "INVALID_INPUT",
        result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      );
  });
export const validateQuery = <T extends z.ZodType>(schema: T) =>
  zValidator("query", schema, (result) => {
    if (!result.success)
      throw new DomainError(
        "INVALID_INPUT",
        400,
        "INVALID_INPUT",
        result.error.issues.map((issue) => ({ path: issue.path, code: issue.code })),
      );
  });
