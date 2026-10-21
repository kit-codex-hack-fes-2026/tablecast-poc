import type { TableEvent } from "@tablecast/api/schema";
import type { ReactNode } from "react";
import { afterEach, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { catalog } from "../../../../.storybook/tablecast-fixtures";
import { MotionProvider } from "../../../components/motion-provider";
import "../../../styles.css";
import { LocaleProvider } from "../../../i18n/locale";
import { type ConversationLine } from "../conversation-model";

export const startedAt = 1788645000000;

export function event(cursor: number, kind: string, data: Record<string, unknown>): TableEvent {
  return {
    cursor,
    kind,
    data,
    storeId: catalog.storeId,
    tableSessionId: "tablecast-session",
    createdAt: startedAt + cursor * 1000,
  };
}

export const line: ConversationLine = {
  id: "tablecast-caption-event",
  turnId: "tablecast-caption-group",
  role: "user",
  text: "お茶をください",
  locale: "ja",
  createdAt: startedAt,
  interrupted: false,
};

export const started = event(1, "voice.turn", { turnId: "tablecast-business", status: "started" });

export const tool = event(2, "voice.tool", {
  turnId: "tablecast-business",
  toolCallId: "tablecast-call",
  toolName: "getCatalog",
  state: "running",
});

export const caption = event(3, "voice.user", {
  role: "user",
  text: line.text,
  turnId: line.turnId,
  locale: "ja",
});

export function Surface({
  children,
  locale = "ja",
  height = 640,
}: {
  children: ReactNode;
  height?: number;
  locale?: "en" | "ja";
}) {
  return (
    <LocaleProvider initialLocale={locale} persist={false}>
      <MotionProvider>
        <div className="max-w-2xl" style={{ height }}>
          {children}
        </div>
      </MotionProvider>
    </LocaleProvider>
  );
}

afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
});
