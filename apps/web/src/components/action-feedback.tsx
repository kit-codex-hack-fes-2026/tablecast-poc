import { Check, LoaderCircle } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useI18n } from "../i18n/locale";
import { ErrorNotice } from "./error-notice";

export function ActionFeedback({
  pending,
  error,
  success,
  successMessage,
}: {
  pending: boolean;
  error: unknown;
  success: boolean;
  successMessage: string;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const state = pending ? "pending" : error ? "error" : success ? "success" : null;
  return (
    <div className="grid min-h-12" aria-busy={pending}>
      <AnimatePresence initial={false} mode="wait">
        {state && (
          <m.div
            key={state}
            initial={{ opacity: 0, transform: reduced ? "none" : "translateY(4px)" }}
            animate={{ opacity: 1, transform: "none" }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.1 } }}
            transition={{ duration: reduced ? 0 : 0.16, ease: [0.23, 1, 0.32, 1] }}
            className="col-start-1 row-start-1"
          >
            {state === "error" ? (
              <ErrorNotice error={error} />
            ) : (
              <p role="status" className="flex min-h-12 items-center gap-2 text-sm">
                {pending ? (
                  <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
                ) : (
                  <Check aria-hidden className="size-4 text-success" />
                )}
                {pending ? t("form_submitting") : successMessage}
              </p>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
