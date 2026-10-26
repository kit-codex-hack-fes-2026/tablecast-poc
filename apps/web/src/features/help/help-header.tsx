import type { ComponentProps } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useSidebar } from "fumadocs-ui/layouts/docs/slots/sidebar";
import { PanelLeft } from "lucide-react";
import { AppHeader } from "../../components/app-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";

export function HelpHeader(props: ComponentProps<"header">) {
  const { t } = useI18n();
  const { lang, _splat } = useParams({ from: "/help/$lang/$" });
  const navigate = useNavigate();
  const { open, setOpen, collapsed, setCollapsed, mode } = useSidebar();
  const expanded = mode === "drawer" ? open : !collapsed;
  const toggle = () => (mode === "drawer" ? setOpen(!open) : setCollapsed(!collapsed));
  useHotkey("Mod+B", toggle, { ignoreInputs: true });
  return (
    <AppHeader
      {...props}
      id="nd-subnav"
      onLocaleChange={(locale) => {
        if (locale !== lang)
          void navigate({
            to: "/help/$lang/$",
            params: { lang: locale, _splat: _splat ?? "" },
            hash: "",
          });
      }}
      navigation={
        <Button
          size="icon"
          variant="ghost"
          aria-label={t("admin_navigation")}
          aria-expanded={expanded}
          aria-keyshortcuts="Control+B Meta+B"
          onClick={toggle}
        >
          <PanelLeft />
        </Button>
      }
      context={<span className="min-w-0 truncate text-sm font-medium">{t("help_title")}</span>}
    />
  );
}
