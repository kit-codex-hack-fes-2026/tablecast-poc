import type { Browser } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function saveRejectedGuestCapture(browser: Browser, out: string, error: unknown) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(out, "tablecast-failure.png") });
    await writeFile(resolve(out, "tablecast-failure.txt"), await page.locator("body").innerText());
    const captured = await page.evaluate(async () => {
      if (!window.tablecastCapture?.startedAt) return null;
      return {
        audio: await window.tablecastCapture.dump(),
        events: {
          audioStartedAt: window.tablecastCapture.startedAt,
          speech: window.tablecastCapture.events,
          screen: window.tablecastScreenEvents,
          pointer: window.tablecastPointerEvents,
        },
      };
    });
    if (captured) {
      await writeFile(
        resolve(out, "tablecast-failure-audio.webm"),
        Buffer.from(captured.audio, "base64"),
      );
      await writeFile(
        resolve(out, "tablecast-failure-events.json"),
        JSON.stringify(captured.events, null, 2),
      );
    }
  }
  await writeFile(
    resolve(out, "tablecast-rejected.json"),
    JSON.stringify(
      { status: "rejected", reason: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  console.error(
    "撮影条件を満たさず不採用。録画の保存終了を待ちます。",
    error instanceof Error ? error.message : String(error),
  );
}
