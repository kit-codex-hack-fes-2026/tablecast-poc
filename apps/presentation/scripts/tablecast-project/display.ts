export const cameraTransitionDuration = 1.1;

export const recapHandoffDuration = 2.35;

export const recapFocus = (item: {
  images?: string[];
  pointFocus?: { at: number; point: number }[];
}) => item.pointFocus ?? (item.images ?? []).map((_, point) => ({ at: point * 0.9, point }));

// 既存録画のviewport検証と、役割に対応する表示枠の識別子。
export const devices = {
  ipad: { label: "iPad / タブレット", width: 1024, height: 768 },
  iphone: { label: "iPhone / スマホ", width: 390, height: 844 },
  macbook: { label: "MacBook / PC", width: 1440, height: 900 },
  window: { label: "ブラウザー・既存収録", width: 1600, height: 900 },
} as const;

export const roles = { customer: "お客さま", staff: "店員", admin: "管理者" } as const;

export const speakers = {
  narrator: "ナレーション",
  customer: "お客さま",
  cast: "キャスト（AI）",
  instruction: "操作・状態",
} as const;

export function escapeText(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeHtml(text: string) {
  return escapeText(text).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
