import { Languages } from "lucide-react";
import type { EditorProps } from "../configuration/configuration-editor-model";
import { useI18n } from "../../i18n/locale";
import { BilingualFields, ConfigurationSection } from "../configuration/configuration-fields";

export function CategoriesEditor({ value, onChange, disabled, selectedId }: EditorProps) {
  const { t } = useI18n();
  const category = value.categories.find((item) => item.id === selectedId);
  return (
    <>
      {category && (
        <>
          <ConfigurationSection title={t("editor_translation")} icon={Languages}>
            <BilingualFields
              value={category.text}
              disabled={disabled}
              onChange={(text) =>
                onChange({
                  ...value,
                  categories: value.categories.map((item) =>
                    item.id === selectedId ? { ...item, text } : item,
                  ),
                })
              }
            />
          </ConfigurationSection>
        </>
      )}
    </>
  );
}
