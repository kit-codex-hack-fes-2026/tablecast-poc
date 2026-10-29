import {
  Bell,
  CircleDashed,
  CircleDollarSign,
  CircleDot,
  Clock3,
  GanttChart,
  Layers,
  LayoutGrid,
  type LucideIcon,
  Radio,
  Table2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { CollectionSort } from "../../components/collection-sort";
import { CollectionToolbar } from "../../components/collection-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import * as Tabs from "../../components/ui/tabs";
import { useI18n } from "../../i18n/locale";
import { type FloorFilter, type FloorSort, floorSortValues } from "./floor-model";

export function FloorControls({
  view,
  filter,
  search,
  sort,
  onSortChange,
  onReset,
  onSearchChange,
  onFilterChange,
  disabled,
}: {
  disabled?: boolean;
  filter: FloorFilter;
  onFilterChange: (value: FloorFilter) => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: FloorSort | undefined) => void;
  search: string;
  sort?: FloorSort;
  view: "list" | "timeline";
}) {
  const { t } = useI18n();
  const filterIcons: Record<FloorFilter, LucideIcon> = {
    all: Layers,
    attention: TriangleAlert,
    active: Users,
    called: Bell,
    billing: CircleDollarSign,
    voice: Radio,
    vacant: CircleDashed,
  };
  const FilterIcon = filterIcons[filter];
  const fields = [
    { value: "table", label: t("collection_table_name"), icon: Table2 },
    { value: "status", label: t("floor_sort_status"), icon: CircleDot },
    { value: "duration", label: t("floor_sort_duration"), icon: Clock3 },
    { value: "guests", label: t("floor_sort_guests"), icon: Users },
    { value: "due", label: t("admin_due"), icon: CircleDollarSign },
  ];
  const sortOptions = [
    ...(view === "list"
      ? [{ value: "", label: t("floor_sort_attention"), icon: TriangleAlert }]
      : []),
    ...fields,
  ];
  const filters = (
    ["all", "attention", "active", "called", "billing", "voice", "vacant"] as const
  ).map((value) => ({ value, label: t(`floor_filter_${value}`), icon: filterIcons[value] }));
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="shrink-0 text-sm font-medium">{t("floor_view")}</p>
        <Tabs.List aria-label={t("floor_view")}>
          <Tabs.Tab value="list" disabled={disabled}>
            <LayoutGrid aria-hidden />
            {t("floor_list")}
          </Tabs.Tab>
          <Tabs.Tab value="timeline" disabled={disabled}>
            <GanttChart aria-hidden />
            {t("floor_timeline")}
          </Tabs.Tab>
        </Tabs.List>
      </div>
      <CollectionToolbar
        disabled={disabled}
        search={{
          label: t("floor_search"),
          placeholder: t("floor_search_placeholder"),
          value: search,
          onChange: onSearchChange,
        }}
        filters={
          view === "list" && (
            <div className="flex flex-col gap-2 text-sm font-medium">
              <span className="flex items-center gap-2">
                <FilterIcon aria-hidden className="size-4 shrink-0" />
                {t("floor_filters")}
              </span>
              <Select
                items={filters}
                value={filter}
                onValueChange={(next) => {
                  if (next) onFilterChange(next);
                }}
                disabled={disabled}
              >
                <SelectTrigger
                  aria-label={t("floor_filters")}
                  className="whitespace-nowrap px-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2 text-left">
                    <FilterIcon aria-hidden className="size-4 shrink-0" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {filters.map(({ value, label, icon: Icon }) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <Icon aria-hidden className="size-4 shrink-0" />
                        {label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        }
        sort={
          <CollectionSort
            options={sortOptions}
            value={sort?.split(":")[0] ?? (view === "timeline" ? "table" : "")}
            descending={sort?.endsWith(":desc") ?? false}
            directionDisabled={!sort && view === "list"}
            onValueChange={(next) =>
              onSortChange(
                floorSortValues.find(
                  (value) => value === `${next}:${sort?.endsWith(":desc") ? "desc" : "asc"}`,
                ),
              )
            }
            onDescendingChange={(descending) =>
              onSortChange(
                floorSortValues.find(
                  (value) =>
                    value === `${sort?.split(":")[0] ?? "table"}:${descending ? "desc" : "asc"}`,
                ),
              )
            }
            disabled={disabled}
          />
        }
        resetDisabled={!search && !sort && filter === "all"}
        onReset={onReset}
      />
    </div>
  );
}
