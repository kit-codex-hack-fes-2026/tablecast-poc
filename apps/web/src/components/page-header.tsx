import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  status,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 flex-1 basis-64 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
          {status && <div className="flex flex-wrap items-center gap-2">{status}</div>}
        </div>
        {description && <p className="max-w-2xl text-base text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
