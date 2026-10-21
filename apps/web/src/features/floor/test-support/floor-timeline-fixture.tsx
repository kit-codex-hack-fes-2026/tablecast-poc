import type { TimelinePage } from "@tablecast/api/schema";
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page } from "vitest/browser";
import { table } from "../../../../.storybook/tablecast-fixtures";
import "../../../styles.css";

export const startAt = Date.parse("2026-09-15T00:00:00+09:00");

export const hour = 3_600_000;

export const initial: TimelinePage = {
  date: "2026-09-15",
  timeZone: "Asia/Tokyo",
  startAt,
  endAt: startAt + 24 * hour,
  observedAt: startAt + 12 * hour,
  sessions: [
    {
      id: table.id,
      tableId: "tablecast-t03",
      guestCount: 4,
      status: "open",
      openedAt: startAt + 9 * hour,
      closedAt: null,
    },
  ],
  nextCursor: { openedAt: startAt + 9 * hour, id: table.id },
};

let client: QueryClient;

let initialViewport: { height: number; width: number };

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});

afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

export const fixture = {
  get client() {
    return client;
  },
  set client(value: typeof client) {
    client = value;
  },
};
