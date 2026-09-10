import { failureLog } from "./platform/telemetry";
import { Container } from "@cloudflare/containers";
import { z } from "zod";

const reservationSchema = z.object({ id: z.string(), until: z.number(), observed: z.boolean() });
const workerSchema = z.object({
  agent_name: z.string(),
  // LiveKitのprotobuf JSONでは既定値0のフィールドは省略される。
  active_jobs: z.number().int().nonnegative().optional().default(0),
});

export class TablecastVoice extends Container<TablecastEnv> {
  override defaultPort = 8081;
  override sleepAfter = "5m";
  override envVars: Record<string, string> = {
    LIVEKIT_URL: this.env.TABLECAST_LIVEKIT_URL,
    LIVEKIT_API_KEY: this.env.TABLECAST_LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: this.env.TABLECAST_LIVEKIT_API_SECRET,
    OPENAI_API_KEY: this.env.OPENAI_API_KEY,
    INWORLD_API_KEY: this.env.INWORLD_API_KEY,
    TABLECAST_API_URL: this.env.TABLECAST_PUBLIC_ORIGIN,
    TABLECAST_VOICE_API_TOKEN: this.env.TABLECAST_VOICE_API_TOKEN,
    TABLECAST_AGENT_NAME: this.env.TABLECAST_AGENT_NAME,
    TABLECAST_ENV: this.env.TABLECAST_ENV,
    TABLECAST_RELEASE_SHA: this.env.TABLECAST_RELEASE_SHA,
    TABLECAST_PR_NUMBER: this.env.TABLECAST_PR_NUMBER ?? "",
    TABLECAST_OTEL_ENDPOINT: this.env.TABLECAST_OTEL_ENDPOINT ?? "",
    TABLECAST_OTEL_AUTHORIZATION: this.env.TABLECAST_OTEL_AUTHORIZATION ?? "",
    TABLECAST_OTEL_CAPTURE_CONTENT: this.env.TABLECAST_OTEL_CAPTURE_CONTENT ?? "false",
    CF_ACCESS_CLIENT_ID: this.env.CF_ACCESS_CLIENT_ID ?? "",
    CF_ACCESS_CLIENT_SECRET: this.env.CF_ACCESS_CLIENT_SECRET ?? "",
  };

  private async jobs() {
    const response = await this.containerFetch("http://tablecast-voice/worker");
    if (!response.ok) throw new Error("音声Agentの待受状態を確認できません。");
    const worker = workerSchema.parse(await response.json());
    if (worker.agent_name !== this.env.TABLECAST_AGENT_NAME)
      throw new Error("音声Agentの環境が一致しません。");
    return worker.active_jobs;
  }

  async reserve(id: string) {
    // 予約の競合判定だけをDOの入力ゲートで直列化する。起動待ちはゲート外で行う。
    const rejection = await this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get<boolean>("stopping")) return "音声Containerの終了処理中です。";
      if (await this.ctx.storage.get<boolean>("draining"))
        return "配備中のため音声の新規受付を停止しています。";
      const reservation = await this.ctx.storage.get("reservation");
      if (reservation) return "この環境の音声session上限に達しています。";
      await this.ctx.storage.put("reservation", {
        id,
        until: Date.now() + 600_000,
        observed: false,
      });
      return undefined;
    });
    // 入力ゲート内の例外はDOをリセットするため、通常の受付拒否は外で返す。
    if (rejection) throw new Error(rejection);
    try {
      await this.startAndWaitForPorts();
      if ((await this.jobs()) > 0) throw new Error("終了処理中の音声jobがあります。");
      this.renewActivityTimeout();
    } catch (error) {
      // tokenを返していないため、この予約から遅れてjobが開始されることはない。
      await this.release(id);
      throw new Error("音声Containerの起動に失敗しました。", { cause: error });
    }
  }

  async release(id: string) {
    await this.ctx.blockConcurrencyWhile(async () => {
      const raw = await this.ctx.storage.get("reservation");
      if (raw && reservationSchema.parse(raw).id === id)
        await this.ctx.storage.delete("reservation");
    });
  }

  async setDraining(value: boolean) {
    const busy = await this.ctx.blockConcurrencyWhile(async () => {
      if (value && (await this.ctx.storage.get("reservation"))) return true;
      await this.ctx.storage.put("draining", value);
      return false;
    });
    if (busy) return false;
    if (value) {
      try {
        const state = await this.getState();
        if ((state.status === "running" || state.status === "healthy") && (await this.jobs()) > 0) {
          await this.ctx.storage.put("draining", false);
          return false;
        }
      } catch (error) {
        await this.ctx.storage.put("draining", false);
        throw new Error("通話の終了を確認できません。配備を再実行してください。", { cause: error });
      }
    }
    return true;
  }

  override async onStop() {
    await this.ctx.storage.delete("stopping");
  }

  override async onActivityExpired() {
    try {
      const jobs = await this.jobs();
      await this.ctx.blockConcurrencyWhile(async () => {
        const raw = await this.ctx.storage.get("reservation");
        const reservation = raw ? reservationSchema.parse(raw) : undefined;
        if (jobs > 0) {
          if (reservation)
            await this.ctx.storage.put("reservation", { ...reservation, observed: true });
          return;
        }
        if (reservation && !reservation.observed && reservation.until > Date.now()) return;
        await this.ctx.storage.delete("reservation");
        await this.ctx.storage.put("stopping", true);
        await this.stop();
      });
    } catch (error) {
      // 不明な状態をidleと扱わず、次の公式activity期限で再確認する。
      failureLog("tablecast.voice.idle_check_failed", error, this.env);
    }
  }
}

export class TablecastEmulate extends Container<TablecastEnv> {
  override defaultPort = 8080;
  override sleepAfter = "5m";
  override envVars: Record<string, string> = {
    TABLECAST_PUBLIC_ORIGIN: this.env.TABLECAST_PUBLIC_ORIGIN,
    TABLECAST_ENV: "preview",
    TABLECAST_OAUTH_PORT: "8080",
  };
}
