import type { ThemeImage } from "@tablecast/api/schema";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
export function StoreLogo({
  logo,
  fallbackLogo,
  width = 96,
  height = 40,
}: {
  fallbackLogo?: null | ThemeImage;
  height?: number;
  logo?: null | ThemeImage;
  width?: number;
}) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState<string[]>([]);
  const images = [logo, fallbackLogo];
  const current = images.find((image) => image && !failed.includes(image.imageKey));
  if (!current) return null;
  return (
    <img
      src={`/media/${current.imageKey}?width=${Math.min(768, width * 2)}`}
      alt={current.alt[locale]}
      className="max-w-full shrink-0 object-contain"
      style={{ width, height }}
      width={width}
      height={height}
      onError={() =>
        setFailed((keys) => [
          ...new Set([
            ...keys.filter((key) => images.some((image) => image?.imageKey === key)),
            current.imageKey,
          ]),
        ])
      }
    />
  );
}
