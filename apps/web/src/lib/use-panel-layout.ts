import { useDefaultLayout } from "react-resizable-panels";

const serverStorage = {
  getItem: () => null,
  // SSRではブラウザーの保存領域を変更しない。
  setItem: () => {},
};
export function usePanelLayout(options: Parameters<typeof useDefaultLayout>[0]) {
  return useDefaultLayout({
    ...options,
    storage: typeof window === "undefined" ? serverStorage : window.localStorage,
  });
}
