/** 保存された端末情報を、ログインを見分けられる短い表示名にする。 */
export function sessionDeviceName(userAgent: null | string | undefined, fallback: string): string {
  if (!userAgent) return fallback;
  const browser = (
    [
      [/Edg(?:e|A|iOS)?\//, "Microsoft Edge"],
      [/OPR\/|Opera/, "Opera"],
      [/SamsungBrowser\//, "Samsung Internet"],
      [/Firefox\/|FxiOS\//, "Firefox"],
      [/Chrome\/|CriOS\//, "Chrome"],
      [/Safari\//, "Safari"],
    ] as const
  ).find(([pattern]) => pattern.test(userAgent))?.[1];
  const platform = (
    [
      [/iPad/, "iPad"],
      [/iPhone|iPod/, "iPhone"],
      [/Android/, "Android"],
      [/Windows/, "Windows"],
      [/CrOS/, "ChromeOS"],
      [/Macintosh|Mac OS X/, "macOS"],
      [/Linux/, "Linux"],
    ] as const
  ).find(([pattern]) => pattern.test(userAgent))?.[1];
  return [browser, platform].filter(Boolean).join(" · ") || fallback;
}
