import { expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import type { recordedTable } from "../tablecast-capture-types.ts";
import type { ShotEvidence } from "../tablecast-shot.ts";
import { tablecastResponseComplete, tablecastVoiceEvents } from "../tablecast-app-capture.ts";
type GuestSpeechContext = {
  audioStartedAt: number;
  initial: { cart: number; orders: number; sessionId: string; tableId: string; tableName: string };
  mark: (id: string) => void;
  marks: { at: number; id: string }[];
  out: string;
  page: Page;
  readTable: () => Promise<z.infer<typeof recordedTable>>;
  root: string;
  shoot: (id: string) => Promise<void>;
  shots: ShotEvidence[];
};
export function guestSpeech({
  page,
  root,
  out,
  readTable,
  mark,
  shoot,
  audioStartedAt,
  initial,
  marks,
  shots,
}: GuestSpeechContext) {
  return async (id: string) => {
    const base64 = (
      await readFile(resolve(root, "apps/presentation/assets/audio", `tablecast-input-${id}.wav`))
    ).toString("base64");
    const inputStartedAt = Date.now();
    mark(id);
    await page.evaluate((input) => window.tablecastCapture.speak(input.base64, input.id), {
      base64,
      id,
    });
    const sceneId = (
      {
        consult: "consult-answer",
        order: "order-added",
        confirm: "readback",
        approve: "approval-result",
      } as Record<string, string>
    )[id];
    if (sceneId && id !== "approve") await shoot(sceneId);
    await expect
      .poll(
        async () => {
          const { events } = z
            .object({
              events: tablecastVoiceEvents,
            })
            .parse(await readTable());
          return (
            tablecastResponseComplete(events, inputStartedAt) &&
            (await page.locator("article[data-role=assistant][data-live=true]").count()) === 0
          );
        },
        { timeout: 60000, message: `${id}への実応答の再生完了` },
      )
      .toBe(true);
    await sleep(800);
    if (sceneId && id === "approve") await shoot(sceneId);
    mark(`${id}-end`);
    await page.screenshot({ path: resolve(out, `tablecast-${id}.png`) });
    await writeFile(resolve(out, `tablecast-${id}.txt`), await page.locator("body").innerText());
    await writeFile(
      resolve(out, "tablecast-audio.webm"),
      Buffer.from(await page.evaluate(() => window.tablecastCapture.dump()), "base64"),
    );
    const telemetry = await page.evaluate(() => ({
      pointer: window.tablecastPointerEvents,
      screen: window.tablecastScreenEvents,
      speech: window.tablecastCapture.events,
    }));
    await writeFile(
      resolve(out, "tablecast-events.json"),
      JSON.stringify(
        {
          source: "Actual Playwright-dispatched browser events and real app responses",
          viewport: { width: 1024, height: 768 },
          audioStartedAt,
          initial,
          marks,
          shots,
          appEvents: (await readTable()).events,
          ...telemetry,
        },
        null,
        2,
      ),
    );
  };
}
