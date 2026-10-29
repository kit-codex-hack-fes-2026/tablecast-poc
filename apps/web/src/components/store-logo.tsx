import type { ThemeImage } from "@tablecast/api/schema";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
import { ProductImage } from "./product-image";
export function StoreLogo({
  logo,
  fallbackLogo,
  width = 96,
  height = 40,
  imageBasePath = "/media",
}: {
  fallbackLogo?: null | ThemeImage;
  height?: number;
  imageBasePath?: string;
  logo?: null | ThemeImage;
  width?: number;
}) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState<string[]>([]);
  const images = [logo, fallbackLogo];
  const current = images.find((image) => image && !failed.includes(image.imageKey));
  if (!current) return null;
  return (
    <ProductImage
      src={`${imageBasePath}/${current.imageKey}`}
      sizes={`${width}px`}
      alt={current.alt[locale]}
      className="max-w-full shrink-0 object-contain"
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
