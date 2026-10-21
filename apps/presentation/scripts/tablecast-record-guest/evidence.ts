import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ShotEvidence } from "../tablecast-shot.ts";
import { screenProject } from "../tablecast-capture-types.ts";
export async function saveAcceptedGuestCapture(
  out: string,
  openscreen: string,
  stderr: string,
  shots: ShotEvidence[],
) {
  const source = screenProject.parse(
    JSON.parse(await readFile(resolve(out, "tablecast-raw.openscreen"), "utf8")),
  );
  execFileSync(
    openscreen,
    ["pack", resolve(out, "tablecast-raw.openscreen"), "--out", resolve(out, "original"), "--json"],
    { windowsHide: true, timeout: 90000 },
  );
  const captureStartedAtMs = Number(stderr.match(/"captureStartedAtMs":(\d+)/)?.[1]);
  if (!Number.isFinite(captureStartedAtMs)) throw new Error("録画開始時刻がありません");
  const savedEvents = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(await readFile(resolve(out, "tablecast-events.json"), "utf8")));
  await writeFile(
    resolve(out, "tablecast-events.json"),
    JSON.stringify({ ...savedEvents, captureStartedAtMs }, null, 2),
  );
  await writeFile(
    resolve(out, "tablecast-take.json"),
    JSON.stringify({ status: "accepted", scenes: shots.map((shot) => shot.sceneId) }, null, 2),
  );
  console.info("保存完了: 実応答・注文結果・音声・操作時刻・OpenScreen元project", source.version);
}
