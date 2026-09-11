import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { chromium, expect, type Browser } from "@playwright/test";
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { readRuntime, tablecastLocal, tablecastRoot } from "./tablecast-runtime";

type AudioObservation = {
  bytesReceived: number;
  packetsReceived: number;
  samplesReceived: number;
  rms: number;
};
declare const tablecastRtc: {
  connect: (credentials: { url: string; token: string }) => Promise<void>;
  publish: () => Promise<void>;
  stats: () => Promise<AudioObservation>;
  disconnected: boolean;
};

// 一時的な検証ページだけで使う。実マイクや製品APIにはアクセスしない。
const checkPage = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>TableCast ローカル音声通信検査</title><body><p>合成音声だけを送受信しています。</p><script src="/livekit.js"></script><script>
const { Room, RoomEvent, LocalAudioTrack, Track } = LivekitClient;
const room = new Room();
let remoteTrack;
let analyser;
const contexts = [];
const nodes = [];
window.tablecastRtc = {
  disconnected: false,
  async connect({ url, token }) { await room.connect(url, token); },
  async publish() {
    const context = new AudioContext({ sampleRate: 48000 });
    contexts.push(context);
    await context.resume();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 440;
    const gain = context.createGain();
    gain.gain.value = 0.1;
    const destination = context.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    nodes.push(oscillator, gain, destination);
    const media = destination.stream.getAudioTracks()[0];
    const track = new LocalAudioTrack(media, {}, true, context);
    await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
  },
  async stats() {
    const result = { bytesReceived: 0, packetsReceived: 0, samplesReceived: 0, rms: 0 };
    if (!remoteTrack || !analyser) return result;
    const values = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(values);
    result.rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    const report = await remoteTrack.getRTCStatsReport();
    if (report) report.forEach((entry) => {
      if (entry.type === 'inbound-rtp' && entry.kind === 'audio') {
        result.bytesReceived += entry.bytesReceived || 0;
        result.packetsReceived += entry.packetsReceived || 0;
        result.samplesReceived += entry.totalSamplesReceived || 0;
      }
    });
    return result;
  }
};
room.on(RoomEvent.TrackSubscribed, async (track) => {
  if (track.kind !== Track.Kind.Audio) return;
  remoteTrack = track;
  const element = document.createElement('audio');
  element.muted = true;
  element.volume = 0;
  document.body.append(track.attach(element));
  await element.play();
  const context = new AudioContext({ sampleRate: 48000 });
  contexts.push(context);
  await context.resume();
  const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
  analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  const muted = context.createGain();
  muted.gain.value = 0;
  source.connect(analyser).connect(muted).connect(context.destination);
  nodes.push(source, analyser, muted);
});
room.on(RoomEvent.Disconnected, () => {
  tablecastRtc.disconnected = true;
  for (const context of contexts) void context.close();
});
</script></body></html>`;

async function main() {
  await expect
    .poll(() => Bun.file(join(tablecastLocal, "runtime.json")).exists(), { timeout: 120_000 })
    .toBe(true);
  const runtime = await readRuntime();
  // CIも開発時と同じforegroundコマンドを使い、試験側で接続可能になるのを待つ。
  for (const endpoint of [
    `${runtime.origin}/api/health`,
    `http://127.0.0.1:${runtime.ports.signaling}/`,
  ]) {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(endpoint, { signal: AbortSignal.timeout(5000) })).ok;
          } catch {
            return false;
          }
        },
        { timeout: 120_000 },
      )
      .toBe(true);
  }

  const url = `ws://127.0.0.1:${runtime.ports.signaling}`;
  const health = await fetch(`http://127.0.0.1:${runtime.ports.signaling}/`, {
    signal: AbortSignal.timeout(2000),
  });
  if (!health.ok) throw new Error("ローカルLiveKitのhealth応答が正常ではありません");
  const settings = parseEnv(await readFile(join(tablecastLocal, ".dev.vars"), "utf8"));
  if (
    settings.TABLECAST_LIVEKIT_URL !== url ||
    !settings.TABLECAST_LIVEKIT_API_KEY ||
    !settings.TABLECAST_LIVEKIT_API_SECRET
  )
    throw new Error("このworktreeのローカルLiveKit設定を確認できません");
  const service = new RoomServiceClient(
    url,
    settings.TABLECAST_LIVEKIT_API_KEY,
    settings.TABLECAST_LIVEKIT_API_SECRET,
    { failover: false, requestTimeout: 5 },
  );
  const roomName = `tablecast-${runtime.id}-rtc-check-${crypto.randomUUID()}`;
  const requireWeb = createRequire(join(tablecastRoot, "apps/web/package.json"));
  const sdk = await readFile(requireWeb.resolve("livekit-client"));
  const server = createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/livekit.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(sdk);
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(checkPage);
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("検証ページのローカルportを取得できません");
  let browser: Browser | undefined;
  let roomCreated = false;
  let roomDeleted = false;
  let stage = "検証ブラウザー起動";
  let observation: AudioObservation = {
    bytesReceived: 0,
    packetsReceived: 0,
    samplesReceived: 0,
    rms: 0,
  };
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required"],
    });
    stage = "Room作成";
    await service.createRoom({ name: roomName, emptyTimeout: 30, maxParticipants: 2 });
    roomCreated = true;
    const publisher = await browser.newPage();
    const subscriber = await browser.newPage();
    await Promise.all([
      publisher.goto(`http://127.0.0.1:${address.port}`),
      subscriber.goto(`http://127.0.0.1:${address.port}`),
    ]);
    const token = async (identity: string, canPublish: boolean) => {
      const access = new AccessToken(
        settings.TABLECAST_LIVEKIT_API_KEY,
        settings.TABLECAST_LIVEKIT_API_SECRET,
        { identity, ttl: "2m" },
      );
      access.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish,
        canPublishSources: [TrackSource.MICROPHONE],
        canSubscribe: true,
        canPublishData: false,
      });
      return access.toJwt();
    };
    stage = "ブラウザー参加";
    await subscriber.evaluate((credentials) => tablecastRtc.connect(credentials), {
      url,
      token: await token("tablecast-check-subscriber", false),
    });
    await publisher.evaluate((credentials) => tablecastRtc.connect(credentials), {
      url,
      token: await token("tablecast-check-publisher", true),
    });
    stage = "合成音声の送受信";
    await publisher.evaluate(() => tablecastRtc.publish());
    await expect
      .poll(
        async () => {
          observation = await subscriber.evaluate(() => tablecastRtc.stats());
          return (
            observation.packetsReceived >= 20 &&
            observation.samplesReceived > 0 &&
            observation.rms > 0.01
          );
        },
        { timeout: 20000 },
      )
      .toBe(true);
    stage = "Room削除と切断";
    await service.deleteRoom(roomName);
    roomDeleted = true;
    await Promise.all([
      publisher.waitForFunction(() => tablecastRtc.disconnected, undefined, { timeout: 10000 }),
      subscriber.waitForFunction(() => tablecastRtc.disconnected, undefined, { timeout: 10000 }),
    ]);
    const result = {
      checkedAt: new Date().toISOString(),
      worktree: runtime.id,
      browser: browser.version(),
      health: true,
      roomCreated: true,
      roomDeleted: true,
      bothParticipantsDisconnected: true,
      source: "440 Hz oscillator",
      microphoneUsed: false,
      externalAiUsed: false,
      observation,
    };
    await writeFile(
      join(tablecastLocal, "livekit-check.json"),
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log(JSON.stringify(result));
  } catch {
    console.error(JSON.stringify({ stage, observation }));
    throw new Error(`ローカルLiveKit検査が失敗しました: ${stage}`);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    if (roomCreated && !roomDeleted) await service.deleteRoom(roomName);
  }
}

await main();
