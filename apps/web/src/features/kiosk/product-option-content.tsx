import type { Product } from "@tablecast/api/schema";
import { MenuOptionImage } from "../../components/menu-option-image";

export function OptionContent({
  option,
  locale,
  id,
}: {
  id: string;
  locale: "en" | "ja";
  option: Product["modifiers"][number]["options"][number];
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <MenuOptionImage
        showIllustration={false}
        compact
        imageKey={option.imageKey}
        imageKind={option.imageKind}
      />
      <span className="min-w-0">
        <span id={`${id}-name`} className="block font-medium wrap-break-word">
          {option.text[locale].displayName}
        </span>
        {option.text[locale].description && (
          <span
            id={`${id}-description`}
            className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-break-word"
          >
            {option.text[locale].description}
          </span>
        )}
      </span>
    </span>
  );
}
