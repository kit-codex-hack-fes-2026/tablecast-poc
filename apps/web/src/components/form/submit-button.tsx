import type { ComponentProps, ReactNode } from "react";
import { useFormContext } from "../../lib/form-context";
import { useI18n } from "../../i18n/locale";
import { Button } from "../ui/button";
export function SubmitButton({
  children,
  ...props
}: ComponentProps<typeof Button> & { children: ReactNode }) {
  const form = useFormContext();
  const { t } = useI18n();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(pending) => (
        <Button
          {...props}
          type="submit"
          disabled={pending || props.disabled}
          aria-busy={pending}
          aria-description={pending ? t("form_submitting") : undefined}
        >
          {children}
        </Button>
      )}
    </form.Subscribe>
  );
}
