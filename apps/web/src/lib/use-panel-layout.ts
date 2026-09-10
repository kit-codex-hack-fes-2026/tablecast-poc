import { useMemo } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { usePanelCookies } from "./panel-layout";

export function usePanelLayout(options: Parameters<typeof useDefaultLayout>[0]) {
  const cookies = usePanelCookies();
  const storage = useMemo(
    () => ({
      getItem(key: string) {
        const name = `tablecast-layout-${encodeURIComponent(key)}=`;
        const source = typeof document === "undefined" ? cookies : document.cookie;
        const value = source
          .split(";")
          .map((cookie) => cookie.trim())
          .find((cookie) => cookie.startsWith(name))
          ?.slice(name.length);
        if (!value) return null;
        try {
          const layout: unknown = JSON.parse(decodeURIComponent(value));
          return typeof layout === "object" &&
            layout !== null &&
            Object.values(layout).every(
              (size) =>
                typeof size === "number" && Number.isFinite(size) && size >= 0 && size <= 100,
            )
            ? JSON.stringify(layout)
            : null;
        } catch {
          return null;
        }
      },
      setItem(key: string, value: string) {
        if (typeof document !== "undefined")
          document.cookie = `tablecast-layout-${encodeURIComponent(key)}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      },
    }),
    [cookies],
  );
  return useDefaultLayout({ ...options, storage, onlySaveAfterUserInteractions: true });
}

export async function readPanelCookies() {
  const cookies = import.meta.env.SSR
    ? await (await import("./api-fetch.server")).readPanelCookies()
    : document.cookie;
  return cookies
    .split(";")
    .filter((cookie) => cookie.trim().startsWith("tablecast-layout-"))
    .join(";");
}
