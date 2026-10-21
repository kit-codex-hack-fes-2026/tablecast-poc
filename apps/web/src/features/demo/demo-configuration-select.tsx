import type { Demo } from "@tablecast/api/schema";
import { FileStack } from "lucide-react";
import { type ReactNode } from "react";
import type { DemoDraft } from "./demo-configuration-model";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { dateTime } from "../../i18n/format";
import { useI18n } from "../../i18n/locale";

export function DemoSelect({
  icon,
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  disabled?: boolean;
  icon: ReactNode;
  items: { label: string; value: string }[];
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="min-w-20 max-w-44 shrink-0" title={label}>
      <Select
        value={value}
        items={items}
        disabled={disabled}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="py-1 text-sm">
          <span aria-hidden="true" className="shrink-0 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
          <span className="flex min-w-0 flex-col items-start text-left">
            <span className="text-xs text-muted-foreground">{label}</span>
            <SelectValue className="max-w-full truncate" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DemoConfigurationSelect({
  data,
  draftItems,
  pending,
  onChange,
}: {
  data: Demo;
  draftItems: DemoDraft[];
  onChange: (value: string) => void;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <DemoSelect
      icon={<FileStack />}
      label={t("demo_configuration")}
      value={data.sourceDraftId ?? "published"}
      disabled={pending}
      items={[
        { value: "published", label: t("demo_published") },
        ...draftItems.map((draft) => ({
          value: draft.id,
          label: `${t("demo_draft")} ${dateTime(draft.createdAt, locale)} · v${draft.id === data.sourceDraftId ? data.sourceVersion : draft.version}`,
        })),
        ...(data.sourceDraftId && !draftItems.some((draft) => draft.id === data.sourceDraftId)
          ? [
              {
                value: data.sourceDraftId,
                label: t("demo_draft"),
              },
            ]
          : []),
      ]}
      onChange={onChange}
    />
  );
}
