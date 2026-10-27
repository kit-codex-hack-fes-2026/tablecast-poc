import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { usePanelCookies } from "../../lib/panel-layout";

const cookieName = "tablecast-navigation";
const eventName = "tablecast-navigation-change";
const group = z.enum(["operations", "menu", "rewards", "store", "workspace", "help"]);
export type NavigationGroupId = z.infer<typeof group>;
const schema = z.object({
  userId: z.string(),
  storeId: z.string().optional(),
  collapsed: z.boolean().optional(),
  groups: z.partialRecord(group, z.boolean()).optional(),
});
type Preferences = z.infer<typeof schema>;
function value(cookies: string) {
  return (
    cookies
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ""
  );
}
function parse(raw: string, userId: string): Preferences {
  try {
    const result = schema.safeParse(JSON.parse(decodeURIComponent(raw)));
    if (result.success && result.data.userId === userId) return result.data;
  } catch {
    /* 破損した表示設定は既定へ戻す。 */
  }
  return { userId };
}
function subscribe(notify: () => void) {
  window.addEventListener(eventName, notify);
  return () => window.removeEventListener(eventName, notify);
}
const snapshot = () => value(document.cookie);

/** 表示設定だけを利用者ごとに復元する。店舗の権限は取得済み店舗一覧で別途検証する。 */
export function useSidebarPreferences(userId = "") {
  const cookies = usePanelCookies();
  const serverSnapshot = useCallback(() => value(cookies), [cookies]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [temporary, setTemporary] = useState<Preferences>({ userId: "" });
  const preferences = useMemo(
    () => (userId ? parse(raw, userId) : temporary),
    [raw, userId, temporary],
  );
  const update = useCallback(
    (change: Omit<Partial<Preferences>, "userId">) => {
      if (!userId) {
        setTemporary((current) => {
          const next = { ...current, ...change, groups: { ...current.groups, ...change.groups } };
          return JSON.stringify(next) === JSON.stringify(current) ? current : next;
        });
        return;
      }
      const current = parse(snapshot(), userId);
      const next = { ...current, ...change, groups: { ...current.groups, ...change.groups } };
      if (JSON.stringify(current) === JSON.stringify(next)) return;
      document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(next))}; Path=/; Max-Age=31536000; SameSite=Lax`;
      window.dispatchEvent(new Event(eventName));
    },
    [userId],
  );
  return { preferences, update };
}
