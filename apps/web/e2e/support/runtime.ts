import { readFileSync } from "node:fs";
import { z } from "zod";

export const runtime = z
  .object({ origin: z.url(), ports: z.object({ mailpit: z.number() }) })
  .parse(
    JSON.parse(readFileSync(new URL("../../../../.local/runtime.json", import.meta.url), "utf8")),
  );
export const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(
    JSON.parse(readFileSync(new URL("../../../../.local/demo.json", import.meta.url), "utf8")),
  );
