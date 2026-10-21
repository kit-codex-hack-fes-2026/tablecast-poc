import { Check, LoaderCircle } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useI18n } from "../i18n/locale";
import { ErrorNotice } from "./error-notice";

/**
 * 操作の進行・失敗・完了を同じ領域で示す。
 * pending、error、success、successMessageを渡し、優先順位は処理中→失敗→成功。
 * 最小高さで配置の揺れを抑え、MotionProviderとreduced motionを尊重する。
 * 音声Agentによる状態の読み上げを追加しない。
 */
export function ActionFeedback({
  pending,
  error,
  success,
  successMessage,
}: {
  error: unknown;
  pending: boolean;
  success: boolean;
  successMessage: string;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const state = pending ? "pending" : error ? "error" : success ? "success" : null;
  const initial = { opacity: reduced ? 1 : 0, transform: reduced ? "none" : "translateY(4px)" };
  const animate = { opacity: 1, transform: "none" };
  const transition = { duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] as const };
  return (
    <div className="grid min-h-12" aria-busy={pending}>
      <div role="status" className="col-start-1 row-start-1">
        {(state === "pending" || state === "success") && (
          <m.p
            key={state}
            initial={initial}
            animate={animate}
            transition={transition}
            className="flex min-h-12 items-center gap-2 text-sm"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
            ) : (
              <Check aria-hidden className="size-4 text-success" />
            )}
            {pending ? t("form_submitting") : successMessage}
          </m.p>
        )}
      </div>
      {state === "error" && (
        <m.div
          initial={initial}
          animate={animate}
          transition={transition}
          className="col-start-1 row-start-1"
        >
          <ErrorNotice error={error} />
        </m.div>
      )}
    </div>
  );
}
