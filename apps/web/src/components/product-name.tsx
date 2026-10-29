import type { PricedLine, Product } from "@tablecast/api/schema";
import { resolveLocalized, resolveText } from "@tablecast/api/localization";
import { useI18n } from "../i18n/locale";

/** 意味訳を先に読み、転写も省略せず別の行へ表示する。 */
function NameLines({ name, transliteration }: { name: string; transliteration?: string }) {
  return (
    <span className="block min-w-0 wrap-anywhere text-foreground">
      <strong className="block font-semibold" dir="auto">
        {name}
      </strong>
      {transliteration && (
        <span className="block font-normal text-muted-foreground" dir="auto">
          {transliteration}
        </span>
      )}
    </span>
  );
}

export function ProductName({ text }: { text: Product["text"] }) {
  const { locale } = useI18n();
  const value = resolveText(text, locale);
  return (
    <NameLines
      name={value.displayName}
      transliteration={locale === "ja" ? undefined : value.transliteration}
    />
  );
}

export function SnapshotProductName({
  line,
}: {
  line: Pick<PricedLine, "name" | "transliteration">;
}) {
  const { locale } = useI18n();
  const language = line.name[locale]?.trim() ? locale : line.name.en?.trim() ? "en" : "ja";
  return (
    <NameLines
      name={resolveLocalized(line.name, language) ?? line.name.ja}
      transliteration={locale === "ja" ? undefined : line.transliteration?.[language]}
    />
  );
}
