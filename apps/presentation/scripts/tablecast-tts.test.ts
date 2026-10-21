import * as files from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import sample from "../sample.json";
import * as projectFiles from "./tablecast-project";
import { projectSchema } from "./tablecast-project";
import { generateAudio, requestSpeech } from "./tablecast-tts";

vi.mock("node:fs/promises", { spy: true });

const project = projectSchema.parse(sample);
const item = { id: "tablecast-test", at: 0, text: "字幕", speech: "読み上げ" };
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("実会話の字幕にはTTSを生成せず、外部APIも呼ばない", async () => {
  const demo = project.scenes.find((scene) => scene.media);
  if (!demo?.media) throw new Error("検証する実録が必要です");
  vi.stubEnv("INWORLD_API_KEY", "tablecast-test-key");
  vi.stubEnv("TABLECAST_PRESENTATION_ENV_FILE", "");
  vi.spyOn(projectFiles, "readProject").mockResolvedValue({
    ...project,
    scenes: [{ ...demo, media: { ...demo.media, audio: true } }],
  });
  vi.spyOn(files, "mkdir").mockResolvedValue(undefined);
  vi.spyOn(files, "rm").mockResolvedValue(undefined);
  const write = vi.spyOn(files, "writeFile").mockResolvedValue(undefined);
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  await generateAudio();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
});

test("課金済み音声の検証失敗でもファイルを残し、再実行で再課金しない", async () => {
  const existingFile = await files.stat(import.meta.filename);
  vi.stubEnv("INWORLD_API_KEY", "tablecast-test-key");
  vi.stubEnv("TABLECAST_PRESENTATION_ENV_FILE", "");
  vi.spyOn(projectFiles, "readProject").mockResolvedValue(project);
  vi.spyOn(projectFiles, "readAudioDuration").mockRejectedValue(new Error("音声検証失敗"));
  vi.spyOn(files, "mkdir").mockResolvedValue(undefined);
  vi.spyOn(files, "stat")
    .mockRejectedValueOnce(Object.assign(new Error(), { code: "ENOENT" }))
    .mockResolvedValue(existingFile);
  vi.spyOn(files, "readdir").mockResolvedValue([]);
  const write = vi.spyOn(files, "writeFile").mockResolvedValue(undefined);
  const remove = vi.spyOn(files, "rm").mockResolvedValue(undefined);
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ audioContent: "UklGRg==" }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(generateAudio()).rejects.toThrow("音声検証失敗");
  await expect(generateAudio()).rejects.toThrow("音声検証失敗");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith(expect.stringMatching(/\.wav$/), Buffer.from("RIFF"), {
    flag: "wx",
  });
  expect(remove).toHaveBeenCalledTimes(2);
  for (const [path] of remove.mock.calls) expect(String(path)).toMatch(/\.tablecast-tts\.lock$/);
});

test("Inworldへ読み補正と生成設定を送り、返された音声をデコードする", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ audioContent: "UklGRg==" }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await requestSpeech(project, item, "tablecast-test-key")).toEqual(Buffer.from("RIFF"));
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.inworld.ai/tts/v1/voice",
    expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Basic tablecast-test-key", "Content-Type": "application/json" },
      body: JSON.stringify({ ...project.tts, text: "読み上げ" }),
    }),
  );
});

test.each([false, true])(
  "発話IDだけの変更は同じ生成条件のWAVを再利用する（破損=%s）",
  async (corrupt) => {
    const original = project.scenes[0];
    if (!original?.cues[0]) throw new Error("保存済み音声に対応する発話が必要です");
    const renamed = { ...original.cues[0], id: "tablecast-renamed-cache-regression" };
    vi.stubEnv("INWORLD_API_KEY", "tablecast-test-key");
    vi.stubEnv("TABLECAST_PRESENTATION_ENV_FILE", "");
    vi.spyOn(projectFiles, "readProject").mockResolvedValue({
      ...project,
      scenes: [{ ...original, cues: [renamed] }],
    });
    vi.spyOn(files, "mkdir").mockResolvedValue(undefined);
    vi.spyOn(files, "rm").mockResolvedValue(undefined);
    const duration = vi.spyOn(projectFiles, "readAudioDuration");
    if (corrupt) duration.mockRejectedValue(new Error("音声検証失敗"));
    else duration.mockResolvedValue(1);
    const copy = vi.spyOn(files, "copyFile").mockResolvedValue(undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateAudio().then(
      () => "再利用",
      (error: Error) => error.message,
    );
    expect(result).toBe(corrupt ? "音声検証失敗" : "再利用");
    expect(copy).toHaveBeenCalledTimes(corrupt ? 0 : 1);
    expect(String(duration.mock.calls[0]?.[0])).not.toContain(renamed.id);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test.each([
  { label: "HTTPエラー", response: new Response("tablecast-secret", { status: 429 }) },
  { label: "非JSON", response: new Response("tablecast-secret") },
  { label: "不正なJSON構造", response: Response.json({ error: "tablecast-secret" }) },
  { label: "不正なbase64", response: Response.json({ audioContent: "!tablecast-secret!" }) },
])("$labelでも本文・キーを例外へ含めず再試行しない", async ({ response }) => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  await expect(requestSpeech(project, item, "tablecast-secret")).rejects.toThrow(
    /^Inworld( HTTP 429。自動再試行はしません|の音声応答形式が不正です)$/,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("通信例外に秘密が含まれていても固定メッセージへ変換する", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("tablecast-secret")));
  await expect(requestSpeech(project, item, "tablecast-secret")).rejects.toThrow(
    "Inworldへの接続が失敗しました。自動再試行はしません",
  );
});
