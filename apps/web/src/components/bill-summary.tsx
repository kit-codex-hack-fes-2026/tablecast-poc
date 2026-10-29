import { cn } from "tailwind-variants";
import { Money } from "./money";

/** 店側・客側・Squareの会計内訳に、APIが確定した金額を同じ形式で表示する。 */
export function BillSummary({
  rows = [],
  total,
  taxIncluded = false,
  className,
}: {
  className?: string;
  rows?: { amount: number; id: string; label: string }[];
  taxIncluded?: boolean;
  total: { amount: number; label: string };
}) {
  return (
    <dl data-ui="bill-summary" className={cn("space-y-2 text-base", className)}>
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd>
            <Money value={row.amount} taxIncluded={taxIncluded} />
          </dd>
        </div>
      ))}
      <div
        data-ui="bill-total"
        className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-4"
      >
        <dt className="text-muted-foreground">{total.label}</dt>
        <dd className="text-2xl font-semibold">
          <Money value={total.amount} taxIncluded={taxIncluded} />
        </dd>
      </div>
    </dl>
  );
}
