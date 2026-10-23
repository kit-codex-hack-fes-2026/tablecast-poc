import { z } from "zod";
import { ensure } from "../../platform/errors";

export function castTool<T extends z.ZodType>(options: {
  description: string;
  execute: (input: z.output<T>) => Promise<unknown>;
  id: string;
  inputSchema: T;
}) {
  const invoke = (input: unknown) => {
    const parsed = options.inputSchema.safeParse(input);
    ensure(parsed.success, "INVALID_INPUT", 422);
    return options.execute(parsed.data);
  };
  return {
    ...options,
    execute: invoke,
    invoke,
    parameters: z.toJSONSchema(options.inputSchema),
  };
}
