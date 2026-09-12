import { useEffect, useEffectEvent, useRef, useState } from "react";
import { parseResponse, rpc, tableEndpoint } from "./api";
import { apiError } from "./api-error";

export function useRealtime(
  scope: "table" | { storeId: string } | undefined,
  snapshotCursor: number,
  onChange: () => void,
  tableClient = tableEndpoint.client,
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
    let queued = false;
    let lastSync = 0;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function synchronise() {
      if (disposed) return;
      if (fetching) {
        queued = true;
        return;
      }
      queued = false;
      fetching = true;
      try {
        const result = await parseResponse(
          storeId
            ? rpc.api.admin.stores[":storeId"].events.$get(
                { param: { storeId }, query: { after: String(cursor.current) } },
                { init: { signal: controller.signal } },
              )
            : tableClient.events.$get(
                { query: { after: String(cursor.current) } },
                { init: { signal: controller.signal } },
              ),
        );
        if (!disposed) {
          lastSync = Date.now();
          queued ||= result.events.length === 500;
          cursor.current = Math.max(cursor.current, result.cursor);
          if (result.events.length) notify();
        }
      } catch (error) {
        if (!disposed) {
          setConnected(false);
          if (apiError(error)?.status === 401) notify();
        }
      } finally {
        fetching = false;
        if (queued && !disposed) void synchronise();
      }
    }
    function connect() {
      if (disposed) return;
      const url = new URL(
        storeId
          ? rpc.api.admin.stores[":storeId"].live.$url({ param: { storeId } })
          : tableClient.live.$url(),
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
      if (document.hidden) return;
      // 通知が届く間は確認pollを減らし、切断中は5秒間隔へ戻す。
      if (socket?.readyState === WebSocket.OPEN && Date.now() - lastSync < 30_000) return;
      void synchronise();
    }, 5000);
    const resume = () => {
      if (!document.hidden) void synchronise();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener("visibilitychange", resume);
      clearInterval(poll);
      clearTimeout(retry);
      socket?.close();
    };
  }, [storeId, enabled, tableClient]);
  return connected;
}
