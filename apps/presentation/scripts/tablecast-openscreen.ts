import { resolve } from "node:path";

export function openscreenPath(override = process.env.TABLECAST_OPENSCREEN) {
  if (override?.trim()) return override;
  return process.platform === "win32" && process.env.LOCALAPPDATA
    ? resolve(process.env.LOCALAPPDATA, "Programs/Openscreen/Openscreen.exe")
    : "openscreen";
}

// page.evaluateへ渡すため、ブラウザー外の変数に依存させない。
export function pinWindowTitle(title: string) {
  document.title = title;
  new MutationObserver(() => {
    if (document.title !== title) document.title = title;
  }).observe(document.head, { childList: true, subtree: true, characterData: true });
}
