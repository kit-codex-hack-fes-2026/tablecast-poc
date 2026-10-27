import type { KeyboardEvent, RefObject } from "react";
import { detectPlatform, useHotkey } from "@tanstack/react-hotkeys";
import { useRef } from "react";

export function useSearchKeyboard({
  anchor,
  input,
  popup,
  query,
  open,
  onOpen,
}: {
  anchor: RefObject<HTMLDivElement | null>;
  input: RefObject<HTMLInputElement | null>;
  onOpen: () => void;
  open: boolean;
  popup: RefObject<HTMLDivElement | null>;
  query: string;
}) {
  const composing = useRef(false);
  useHotkey(
    "Mod+K",
    (event) => {
      if (
        composing.current ||
        event.isComposing ||
        event.keyCode === 229 ||
        !anchor.current?.getClientRects().length
      )
        return;
      onOpen();
      input.current?.focus();
      input.current?.select();
    },
    { ignoreInputs: false },
  );
  return {
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // Safariの変換確定EnterではisComposingがfalseになる場合もある。
      if (
        !open ||
        !query ||
        composing.current ||
        event.nativeEvent.isComposing ||
        event.nativeEvent.keyCode === 229 ||
        event.repeat
      )
        return;
      const modifier =
        detectPlatform() === "mac"
          ? event.metaKey && !event.ctrlKey
          : event.ctrlKey && !event.metaKey;
      const number =
        modifier && !event.altKey && !event.shiftKey && /^[1-4]$/.test(event.key)
          ? Number(event.key) - 1
          : undefined;
      const first =
        event.key === "Enter" &&
        event.target === input.current &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey;
      if (number === undefined && !first) return;
      event.preventDefault();
      const results = [
        ...(popup.current?.querySelectorAll<HTMLAnchorElement>("a[data-search-result]") ?? []),
      ].filter((link) => link.dataset.searchQuery === query);
      results[number ?? 0]?.click();
    },
  };
}
