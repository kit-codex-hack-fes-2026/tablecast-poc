import type { ThemeImage } from "@tablecast/api/schema";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
export function StoreLogo({
  logo,
  width = 96,
  height = 40,
  fallback,
}: {
  logo?: ThemeImage | null;
  width?: number;
  height?: number;
  fallback?: string;
}) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState<string>();
  if (!logo || failed === logo.imageKey)
    return fallback ? (
      <span className="block max-w-full text-sm font-semibold wrap-anywhere">{fallback}</span>
    ) : null;
  return (
    <img
      src={`/media/${logo.imageKey}?width=768`}
      alt={logo.alt[locale]}
      className="max-w-full shrink-0 object-contain"
      style={{ width, height }}
      width={width}
      height={height}
      onError={() => setFailed(logo.imageKey)}
    />
  );
}
