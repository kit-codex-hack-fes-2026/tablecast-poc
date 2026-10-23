import { Monitor, RefreshCw, RotateCw, Tablet } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { DemoSelect } from "./demo-configuration-select";
import { type DemoDevice, demoDevices } from "./demo-device-model";

export function DemoReloadButton({
  available,
  pending,
  onReload,
}: {
  available: boolean;
  onReload: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  return (
    <span title={available ? t("demo_update_available") : t("demo_up_to_date")}>
      <Button
        variant={available ? "default" : "ghost"}
        className="flex-col gap-1 px-2 text-xs"
        aria-label={t("demo_reload")}
        disabled={pending || !available}
        onClick={onReload}
      >
        <RefreshCw />
        {t("demo_reload")}
      </Button>
      <span role="status" className="sr-only">
        {available ? t("demo_update_available") : ""}
      </span>
    </span>
  );
}

export function DemoDisplayControls({
  device,
  portrait,
  onChange,
}: {
  device: DemoDevice;
  onChange: (device: DemoDevice, portrait: boolean) => void;
  portrait: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {" "}
      <DemoSelect
        icon={device === "browser" ? <Monitor /> : <Tablet />}
        label={t("demo_display")}
        value={device}
        items={[
          { value: "browser", label: t("demo_browser") },
          ...Object.entries(demoDevices).map(([value, item]) => ({ value, label: item.label })),
        ]}
        onChange={(value) => {
          if (
            value === "browser" ||
            value === "ipad" ||
            value === "ipad-air-11" ||
            value === "ipad-air-13"
          )
            onChange(value, portrait);
        }}
      />
      <Button
        variant="ghost"
        className="flex-col gap-1 px-2 text-xs"
        aria-label={t("demo_rotate")}
        aria-pressed={portrait}
        title={portrait ? t("demo_landscape") : t("demo_portrait")}
        disabled={device === "browser"}
        onClick={() => onChange(device, !portrait)}
      >
        <RotateCw />
        {t("demo_rotate")}
      </Button>
    </>
  );
}
