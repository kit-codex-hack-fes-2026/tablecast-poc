import { eventsSchema } from "./responses";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { api, ApiFailure } from "./api";

export function useRealtime(
  base: string | undefined,
  snapshotCursor: number,
  onChange: () => void,
) {
  const [connected, setConnected] = useState(false);
  const notify = useEffectEvent(onChange);
  const cursor = useRef(snapshotCursor);
  const getSnapshotCursor = useEffectEvent(() => snapshotCursor);
  useEffect(() => {
    cursor.current = Math.max(cursor.current, snapshotCursor);
  }, [snapshotCursor]);
  useEffect(() => {
    if (!base) return undefined;
    cursor.current = getSnapshotCursor();
    let disposed = false;
    let fetching = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function synchronise() {
      if (fetching || disposed) return;
      fetching = true;
      try {
        const result = await api(
          `${base}/events?after=${cursor.current}`,
          { signal: controller.signal },
          eventsSchema,
        );
        if (!disposed) {
          cursor.current = Math.max(cursor.current, result.cursor);
          if (result.events.length) notify();
        }
      } catch (error) {
        if (!disposed) {
          setConnected(false);
          if (error instanceof ApiFailure && error.status === 401) notify();
        }
      } finally {
        fetching = false;
      }
    }
    function connect() {
      if (disposed) return;
      const url = new URL(`${base}/live`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => {
        setConnected(true);
        void synchronise();
      };
      socket.onmessage = () => {
        void synchronise();
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, 3000);
      };
      socket.onerror = () => {
        socket?.close();
      };
    }
    connect();
    const poll = setInterval(() => {
      void synchronise();
    }, 5000);
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(poll);
      clearTimeout(retry);
      socket?.close();
    };
  }, [base]);
  return connected;
}
