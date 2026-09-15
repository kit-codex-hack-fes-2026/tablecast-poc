import { trace } from "@opentelemetry/api";
import { observeOperation } from "../../platform/telemetry";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import { createCastTools } from "./agent";
import { type toolSchema, voiceToolEventSchema } from "./model";
import { currentVoiceTurn, voiceContext } from "./queries";
import { recordVoiceEvent, voiceToolQuery } from "./service";
export async function conversationHistory(
  services: ApiServices,
  actor: { storeId: string; tableSessionId?: string },
  maxCharacters = 16000,
) {
  return conversationHistoryValue(await conversationHistoryQuery(services, actor), maxCharacters);
}

export function conversationHistoryQuery(
  services: ApiServices,
  actor: { storeId: string; tableSessionId?: string },
) {
  // 同じ来店のSDK字幕を再利用する。実際に聞こえた範囲との厳密な一致は求めない。
  return services.db
    .select({ kind: business.tableEvents.kind, data_json: business.tableEvents.data_json })
    .from(business.tableEvents)
    .where(
      and(
        eq(business.tableEvents.store_id, actor.storeId),
        eq(business.tableEvents.table_session_id, actor.tableSessionId ?? ""),
        inArray(business.tableEvents.kind, ["voice.user", "voice.assistant"]),
        sql`length(trim(json_extract(${business.tableEvents.data_json},'$.text')))>0`,
      ),
    )
    .orderBy(desc(business.tableEvents.cursor))
    .limit(40);
}

export function conversationHistoryValue(
  rows: Awaited<ReturnType<typeof conversationHistoryQuery>>,
  maxCharacters = 16000,
) {
  const history: { role: "user" | "assistant"; content: string; interrupted: boolean }[] = [];
  let characters = 0;
  for (const row of rows) {
    const data = z
      .object({ text: z.string(), interrupted: z.boolean().optional() })
      .parse(JSON.parse(row.data_json));
    if (characters + data.text.length > maxCharacters) break;
    characters += data.text.length;
    history.push({
      role: row.kind === "voice.user" ? "user" : "assistant",
      content: data.text,
      interrupted: data.interrupted ?? false,
    });
  }
  return history.toReversed();
}
export async function invokeVoiceTool(
  services: ApiServices,
  input: z.infer<typeof toolSchema>,
  signal: AbortSignal,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  return observeOperation(
    "tablecast.voice.tool",
    async () => {
      trace.getActiveSpan()?.setAttributes({
        "tablecast.tool.name": input.toolName,
        "tablecast.tool.call.id": input.toolCallId,
        "tablecast.voice.session.id": input.voiceSessionId,
        "tablecast.voice.turn.id": input.turnId,
      });
      const { actor, session, proactive } = await voiceContext(
        services,
        input.voiceSessionId,
        input.turnId,
      );
      const trigger = proactive ? "proactive" : "user";
      if (trigger === "proactive") await currentVoiceTurn(services, actor, session.locale, trigger);
      const tools = createCastTools(services, actor, signal, trigger, session);
      const tool = tools[input.toolName];
      const record = async (state: "running" | "completed" | "error", errorCode?: string) =>
        recordVoiceEvent(
          services,
          actor,
          {
            kind: "voice.tool",
            data: {
              toolName: input.toolName,
              toolCallId: input.toolCallId,
              state,
              query: voiceToolQuery(input.toolName, input.arguments),
              ...(errorCode ? { errorCode } : {}),
            },
          },
          true,
          waitUntil,
        );
      // 一つのINSERTでcall IDを予約し、再送や並行要求を実行前に拒否する。
      ensure(await record("running"), "VOICE_TOOL_ALREADY_CALLED", 409);
      try {
        ensure(tool?.execute, "VOICE_TOOL_FORBIDDEN", 403);
        const result = await tool.invoke(input.arguments);
        trace
          .getActiveSpan()
          ?.setAttribute(
            "tablecast.tool.output_bytes",
            new TextEncoder().encode(JSON.stringify(result)).byteLength,
          );
        await record("completed");
        return { result };
      } catch (error) {
        const code = voiceToolEventSchema.shape.errorCode.safeParse(
          error instanceof DomainError ? error.code : "VOICE_TOOL_FAILED",
        );
        await record("error", code.success ? code.data : "VOICE_TOOL_FAILED");
        throw error;
      }
    },
    { env: services.env, input: { toolName: input.toolName } },
  );
}
