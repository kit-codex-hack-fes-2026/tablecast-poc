import { expect, it } from "vitest";
import { sessionDeviceName } from "./session-device-model";

it.each([
  [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36",
    "Chrome · macOS",
  ],
  [
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/134.0 Safari/537.36 Edg/134.0",
    "Microsoft Edge · Windows",
  ],
  [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 FxiOS/123.0 Mobile/15 Safari/605.1.15",
    "Firefox · iPhone",
  ],
  [
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15 Safari/604.1",
    "Safari · iPad",
  ],
  [
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/123.0 Mobile Safari/537.36 SamsungBrowser/25.0",
    "Samsung Internet · Android",
  ],
  ["TableCast unknown client", "端末"],
  [null, "端末"],
])("保存済みUAから端末名を表示する: %s", (userAgent, expected) => {
  expect(sessionDeviceName(userAgent, "端末")).toBe(expected);
});
