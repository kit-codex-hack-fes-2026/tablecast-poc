import { trace } from "@opentelemetry/api";
import { and, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import * as business from "../../db/business-schema";
import { DomainError, ensure } from "../../platform/errors";
import { localeSchema } from "../../platform/model";
import { observeOperation } from "../../platform/telemetry";
import { llmSessionId } from "../../platform/telemetry-llm";
import { displayCurrencyActionSchema } from "../currency/model";
import { createCastTools } from "./agent";
import { type toolSchema, voiceToolEventSchema } from "./model";
import { currentVoiceTurn, voiceContext } from "./queries";
import { recordVoiceEvent } from "./service";
import { finishVoiceTurn } from "./turns";
export async function conversationHistory(
  services: ApiServices,
  actor: { storeId: string; tableSessionId?: string },
  maxCharacters = 16000,
) {
  // 同じ来店のSDK字幕を再利用する。実際に聞こえた範囲との厳密な一致は求めない。
  const rows = await services.db
    .select({ kind: business.tableEvents.kind, data_json: business.tableEvents.data_json })
    .from(business.tableEvents)
    .where(
      and(
        eq(business.tableEvents.store_id, actor.storeId),
        eq(business.tableEvents.table_session_id, actor.tableSessionId ?? ""),
        inArray(business.tableEvents.kind, ["voice.user", "voice.assistant"]),
        notExists(
          services.db
            .select({ id: business.customerContexts.sessionId })
            .from(business.customerContexts)
            .where(
              and(
                eq(business.customerContexts.sessionId, actor.tableSessionId ?? ""),
                eq(business.customerContexts.storeId, actor.storeId),
              ),
            ),
        ),
        sql`length(trim(json_extract(${business.tableEvents.data_json},'$.text')))>0`,
      ),
    )
    .orderBy(desc(business.tableEvents.cursor))
    .limit(40);
  const history: { content: string; interrupted: boolean; role: "assistant" | "user" }[] = [];
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
      const { actor, session, proactive, opening, personal } = await voiceContext(
        services,
        input.voiceSessionId,
        input.turnId,
      );
      if (!personal && services.env.TABLECAST_ENV !== "production") {
        trace.getActiveSpan()?.setAttributes({
          "tablecast.observation.type": "tool",
          "tablecast.session.id": llmSessionId(services.env, session.id),
          ...(services.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true"
            ? { "tablecast.input": JSON.stringify(input.arguments) }
            : {}),
        });
      }
      const trigger = opening ? "opening" : proactive ? "proactive" : "user";
      if (trigger === "proactive") await currentVoiceTurn(services, actor, session.locale, trigger);
      const tools = createCastTools(
        personal
          ? { ...services, env: { ...services.env, TABLECAST_OTEL_CAPTURE_CONTENT: "false" } }
          : services,
        actor,
        signal,
        trigger,
        session,
        input.displayCurrency,
      );
      const tool = tools[input.toolName];
      const record = async (state: "completed" | "error" | "running", errorCode?: string) =>
        recordVoiceEvent(
          services,
          actor,
          {
            kind: "voice.tool",
            data: {
              toolName: input.toolName,
              toolCallId: input.toolCallId,
              state,
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
        if (
          !personal &&
          services.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true" &&
          services.env.TABLECAST_ENV !== "production"
        )
          trace.getActiveSpan()?.setAttribute("tablecast.output", JSON.stringify(result));
        trace
          .getActiveSpan()
          ?.setAttribute(
            "tablecast.tool.output_bytes",
            new TextEncoder().encode(JSON.stringify(result)).byteLength,
          );
        await record("completed");
        if (input.toolName === "endConversation")
          await finishVoiceTurn(services, input.voiceSessionId, input.turnId, "interrupted");
        return {
          ...(input.toolName === "endConversation" ? { conversationAction: "end" as const } : {}),
          ...(input.toolName === "setLanguage"
            ? {
                conversationAction: "language" as const,
                locale: localeSchema.parse(input.arguments.locale),
              }
            : {}),
          result,
          ...(input.toolName === "captureCamera" ? { cameraAction: "capture" as const } : {}),
          ...(input.toolName === "setDisplayCurrency"
            ? {
                displayCurrencyAction: displayCurrencyActionSchema.parse({
                  currency: input.arguments.currency,
                  revision: input.displayCurrency?.revision,
                }),
              }
            : {}),
        };
      } catch (error) {
        const code = voiceToolEventSchema.shape.errorCode.safeParse(
          error instanceof DomainError ? error.code : "VOICE_TOOL_FAILED",
        );
        await record("error", code.success ? code.data : "VOICE_TOOL_FAILED");
        throw error;
      }
    },
    {
      env: { ...services.env, TABLECAST_OTEL_CAPTURE_CONTENT: "false" },
      input: { toolName: input.toolName },
    },
  );
}
