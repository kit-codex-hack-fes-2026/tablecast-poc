import type { ReactNode } from "react";

/**
 * 対象名を先頭で示す。
 * iconは対象の種類、descriptionは見出しに付随する短い説明。
 * titleは必須、descriptionは説明、statusは状態、actionsは次の操作。
 * 戻り先リンクは呼出し元に置く。
 * リンクと権限は呼出し元が決める。
 * 対象名を曖昧な操作名に置き換えず、画面内のh1を重複させない。
 */
export function PageHeader({
  title,
  icon,
  description,
  status,
  actions,
}: {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-border pb-5">
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info [&_svg]:size-6"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-2xl leading-tight font-semibold tracking-tight wrap-anywhere">
              {title}
            </h1>
            {status && <div className="flex flex-wrap items-center gap-2">{status}</div>}
          </div>
          {description && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2 self-center">
          {actions}
        </div>
      )}
    </header>
  );
}
