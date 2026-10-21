import { CircleAlert } from "lucide-react";
import type { SidebarStore } from "./sidebar-model";
import { StoreIcon } from "../../components/store-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useI18n } from "../../i18n/locale";
import { SidebarTooltip } from "./navigation-link";

export function StorePicker({
  stores,
  selectedStore,
  pending,
  onChange,
  collapsed = false,
  error,
}: {
  collapsed?: boolean;
  error?: unknown;
  onChange: (id: string) => void;
  pending: boolean;
  selectedStore?: string;
  stores: SidebarStore[];
}) {
  const { t } = useI18n();
  const selected = stores.find((item) => item.id === selectedStore);
  return (
    <div className="min-w-0 space-y-2">
      <Select
        items={stores.map((store) => ({ value: store.id, label: store.name }))}
        value={selectedStore ?? null}
        disabled={pending}
        onValueChange={(value) => {
          if (value) onChange(value);
        }}
      >
        <SidebarTooltip label={selected?.name ?? t("stores_title")} collapsed={collapsed}>
          <SelectTrigger
            showIndicator={!collapsed}
            className={`min-w-0 border-0 bg-transparent shadow-none hover:bg-control-hover ${collapsed ? "justify-center px-0" : "justify-start px-2"}`}
            aria-label={t("stores_title")}
          >
            <StoreIcon
              name={selected?.name ?? t("admin_store")}
              logo={selected?.logo}
              className={collapsed ? "size-7" : undefined}
            />
            <SelectValue
              className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}
              placeholder={t("stores_title")}
            />
          </SelectTrigger>
        </SidebarTooltip>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              <span className="flex items-center gap-2">
                <StoreIcon name={store.name} logo={store.logo} />
                {store.name}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!!error && (
        <p
          role="alert"
          className="flex items-center gap-2 px-2 text-sm text-destructive"
          title={t("account_failed")}
        >
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          <span className={collapsed ? "sr-only" : undefined}>{t("account_failed")}</span>
        </p>
      )}
    </div>
  );
}
