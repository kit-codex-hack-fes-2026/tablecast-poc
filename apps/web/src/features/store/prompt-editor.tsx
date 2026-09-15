import { instructionText, type CastInstruction, type Locale } from "@tablecast/api/schema";
import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
export type PromptEditorProps = {
  id: string;
  labelledBy: string;
  language: Locale;
  value: CastInstruction;
  onChange: (value: CastInstruction) => void;
  disabled: boolean;
  focusRequested?: boolean;
};
export function PromptEditor(props: PromptEditorProps) {
  const { t } = useI18n();
  const hydrated = useHydrated();
  const module = useQuery({
    queryKey: ["tablecast-prompt-editor"],
    queryFn: () => import("./prompt-editor-input"),
    enabled: hydrated,
    staleTime: Infinity,
    retry: false,
  });
  if (module.data) return <module.data.default {...props} />;
  return (
    <div className="space-y-2">
      <div
        id={props.id}
        role="textbox"
        aria-readonly="true"
        aria-multiline="true"
        aria-labelledby={props.labelledBy}
        tabIndex={0}
        className="min-h-56 whitespace-pre-wrap rounded-xl border border-input p-4"
      >
        {instructionText(props.value)}
      </div>
      <p role="status">{t(module.isError ? "prompt_load_error" : "prompt_loading")}</p>
      {module.isError && (
        <Button type="button" variant="outline" onClick={() => void module.refetch()}>
          {t("common_retry")}
        </Button>
      )}
    </div>
  );
}
