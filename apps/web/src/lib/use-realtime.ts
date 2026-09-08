import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiFailure, parseResponse, rpc } from "./api";

export function useRealtime(
  scope: "table" | { storeId: string } | undefined,
  snapshotCursor: number,
  onChange: () => void,
) {
  const storeId = typeof scope === "object" ? scope.storeId : undefined;
  const enabled = scope !== undefined;
  const [connected, setConnected] = useState(false);
  const notify = useEffectEvent(onChange);
  const cursor = useRef(snapshotCursor);
  const getSnapshotCursor = useEffectEvent(() => snapshotCursor);
  useEffect(() => {
    if (!enabled) return undefined;

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
        const result = await parseResponse(
          storeId
            ? rpc.api.admin.stores[":storeId"].events.$get(
                { param: { storeId }, query: { after: String(cursor.current) } },
                { init: { signal: controller.signal } },
              )
            : rpc.api.table.events.$get(
                { query: { after: String(cursor.current) } },
                { init: { signal: controller.signal } },
              ),
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
      const url = new URL(
        storeId
          ? rpc.api.admin.stores[":storeId"].live.$url({ param: { storeId } })
          : rpc.api.table.live.$url(),
        window.location.href,
      );
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(url);
      socket.addEventListener("open", () => {
        setConnected(true);
        void synchronise();
      });
      socket.addEventListener("message", () => {
        void synchronise();
      });
      socket.addEventListener("close", () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, 3000);
      });
      socket.addEventListener("error", () => {
        socket?.close();
      });
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
  }, [storeId, enabled]);
  return connected;
}
