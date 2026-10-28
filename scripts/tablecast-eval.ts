import { castSessionInstructions, toolInstructions } from "@tablecast/api/speech";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import OpenAI from "openai";
import { z } from "zod";
import { langfuseTarget } from "./tablecast-observability-config.ts";
import { localReleaseSha } from "./tablecast-runtime.ts";

export const evaluationCases = z
  .array(
    z.object({
      id: z.string().min(1),
      input: z.object({
        locale: z.enum(["ja", "en"]),
        messages: z
          .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
          .min(1),
      }),
      expectedOutput: z.string().min(1),
      metadata: z.object({
        caseId: z.string(),
        scenario: z.string(),
        provenance: z.literal("synthetic-draft"),
      }),
    }),
  )
  .min(1)
  .max(100);

const toolSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    strict: z.boolean().nullable(),
  }),
  z.object({ type: z.literal("web_search") }),
]);
export const evaluationConfiguration = z.object({
  locale: z.enum(["ja", "en"]),
  storeInstructions: z.string(),
  override: z.string().nullable().optional(),
  responses: z.object({ model: z.string(), tools: z.array(toolSchema) }),
});

export function evaluationRequest(
  configuration: z.infer<typeof evaluationConfiguration>,
  item: z.infer<typeof evaluationCases>[number],
  maxOutputTokens: number,
) {
  if (configuration.locale !== item.input.locale)
    throw new Error("snapshotと評価ケースの言語が一致しません。");
  const inventory = toolInstructions(
    configuration.responses.tools.flatMap((tool) =>
      tool.type === "function" ? [{ id: tool.name, description: tool.description }] : [],
    ),
  );
  return {
    model: configuration.responses.model,
    instructions: `${castSessionInstructions(item.input.locale, "user", configuration.override)}\n${inventory}\n${configuration.storeInstructions}`,
    input: item.input.messages,
    tools: configuration.responses.tools,
    store: false,
    max_output_tokens: maxOutputTokens,
    max_tool_calls: 4,
    reasoning: { effort: "low" as const, summary: "auto" as const },
    text: { verbosity: "low" as const },
    service_tier: "priority" as const,
    parallel_tool_calls: true,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      target: { type: "string" },
      dataset: { type: "string", default: "infra/observability/tablecast-eval-cases.json" },
      configuration: { type: "string" },
      baseline: { type: "string" },
      output: { type: "string", default: ".local/tablecast-eval.json" },
      live: { type: "boolean", default: false },
      replay: { type: "string" },
      limit: { type: "string", default: "10" },
      concurrency: { type: "string", default: "1" },
      "max-output-tokens": { type: "string", default: "1024" },
    },
    strict: true,
  });
  const cases = evaluationCases.parse(JSON.parse(await readFile(values.dataset, "utf8")));
  if (!values.live && !values.replay) {
    console.info(
      JSON.stringify(
        {
          mode: "draft",
          cases,
          instructions:
            "--configuration <session snapshot.json>と--liveまたは--replay <記録済み応答.json>を指定。期待動作は人によるレビュー用であり合格判定ではない。",
        },
        null,
        2,
      ),
    );
  } else {
    if (values.live && values.replay) throw new Error("liveとreplayを同時に指定できません。");
    if (!values.configuration)
      throw new Error("session開始時のconfiguration snapshotを指定してください。");
    const configuration = evaluationConfiguration.parse(
      JSON.parse(await readFile(values.configuration, "utf8")),
    );
    const limit = z.coerce.number().int().min(1).max(20).parse(values.limit);
    const concurrency = z.coerce.number().int().min(1).max(2).parse(values.concurrency);
    const maxOutputTokens = z.coerce
      .number()
      .int()
      .min(128)
      .max(4096)
      .parse(values["max-output-tokens"]);
    const data = cases.filter((item) => item.input.locale === configuration.locale).slice(0, limit);
    if (!data.length) throw new Error("snapshotの言語に対応するケースがありません。");
    const datasetHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
    const baselineSchema = z.object({
      experimentId: z.string(),
      datasetHash: z.string(),
      mode: z.string(),
      results: z.array(z.object({ id: z.string(), output: z.unknown() })),
    });
    const baseline = values.baseline
      ? baselineSchema.parse(JSON.parse(await readFile(values.baseline, "utf8")))
      : undefined;
    const mode = values.live ? "responses-text-live" : "recorded-replay";
    if (baseline && (baseline.datasetHash !== datasetHash || baseline.mode !== mode))
      throw new Error("比較元と同じデータセット・評価方式を使用してください。");
    const target = await langfuseTarget(values.target ?? "");
    // 資格情報を確定してからSDKを初期化し、Workers用providerとは共有しない。
    const { LangfuseClient } = await import("@langfuse/client");
    const { LangfuseSpanProcessor } = await import("@langfuse/otel");
    const { startActiveObservation } = await import("@langfuse/tracing");
    const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
    const sdk = new NodeTracerProvider({
      spanProcessors: [
        new LangfuseSpanProcessor({
          ...target,
          environment: "evaluation",
          mediaUploadEnabled: false,
        }),
      ],
    });
    sdk.register();
    const client = new LangfuseClient(target);
    try {
      const recorded = values.replay
        ? z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(values.replay, "utf8")))
        : undefined;
      const application = values.live ? parseEnv(await readFile(".env.local", "utf8")) : {};
      const model = values.live
        ? new OpenAI({
            apiKey: process.env.TABLECAST_MODEL_API_KEY ?? application.TABLECAST_MODEL_API_KEY,
            maxRetries: 0,
            timeout: 30_000,
          })
        : undefined;
      const sha = await localReleaseSha(resolve(import.meta.dirname, ".."));
      const result = await client.experiment.run({
        name: `tablecast-${mode}`,
        data,
        maxConcurrency: concurrency,
        metadata: {
          sha,
          datasetHash,
          baselineExperimentId: baseline?.experimentId,
          expectedOutputs: "human-review-draft",
          mode,
        },
        task: async (raw) => {
          const metadata = evaluationCases.element.shape.metadata.parse(raw.metadata);
          const item = evaluationCases.element.parse({ ...raw, id: metadata.caseId });
          if (recorded) {
            if (!(item.id in recorded)) throw new Error(`記録済み応答がありません: ${item.id}`);
            return recorded[item.id];
          }
          if (!model) throw new Error("評価用モデルがありません。");
          return startActiveObservation(
            "tablecast.responses.evaluation",
            async (span) => {
              const request = evaluationRequest(configuration, item, maxOutputTokens);
              span.update({
                input: {
                  instructions: request.instructions,
                  input: request.input,
                  tools: request.tools,
                },
                model: request.model,
              });
              const response = await model.responses.create(request);
              span.update({
                output: response.output,
                usageDetails: response.usage
                  ? {
                      input: response.usage.input_tokens,
                      output: response.usage.output_tokens,
                      input_cached: response.usage.input_tokens_details.cached_tokens,
                    }
                  : undefined,
              });
              return {
                output: response.output,
                usage: response.usage,
                status: response.status,
                model: response.model,
              };
            },
            { asType: "generation" },
          );
        },
      });
      const results = result.itemResults.map((item) => ({
        id: evaluationCases.element.shape.metadata.parse(item.item.metadata).caseId,
        output: z.unknown().parse(item.output),
      }));
      await mkdir(dirname(values.output), { recursive: true });
      await writeFile(
        values.output,
        JSON.stringify(
          {
            experimentId: result.experimentId,
            experimentUrl: result.experimentUrl,
            datasetHash,
            mode,
            sha,
            baselineExperimentId: baseline?.experimentId,
            results,
            comparison: baseline
              ? results.map((item) => ({
                  id: item.id,
                  before: baseline.results.find((row) => row.id === item.id)?.output,
                  after: item.output,
                }))
              : undefined,
          },
          null,
          2,
        ) + "\n",
        { mode: 0o600 },
      );
      console.info(await result.format({ includeItemResults: true }));
      console.info(`比較・レビュー用結果: ${values.output}`);
    } finally {
      try {
        await client.flush();
      } finally {
        await sdk.shutdown();
      }
    }
  }
}
