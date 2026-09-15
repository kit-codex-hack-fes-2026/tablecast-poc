import type { ThemeImage } from "@tablecast/api/schema";
import { useState } from "react";
import { useI18n } from "../../i18n/locale";
export function StoreLogo({ logo }: { logo?: ThemeImage | null }) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState<string>();
  if (!logo || failed === logo.imageKey) return null;
  return (
    <img
      src={`/media/${logo.imageKey}?width=384`}
      alt={logo.alt[locale]}
      className="h-10 w-24 shrink-0 object-contain"
      width={96}
      height={40}
      onError={() => setFailed(logo.imageKey)}
    />
  );
}
