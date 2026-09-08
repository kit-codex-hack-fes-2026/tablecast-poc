import { Link } from "@tanstack/react-router";
import { BookOpen, Blocks, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "../../i18n/locale";
import { SettingsShell } from "./settings-shell";

export function IntegrationsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <SettingsShell>
      <h1 className="text-2xl font-semibold">{t("mcp_sessions")}</h1>
      <nav
        aria-label={t("mcp_sessions")}
        className="flex gap-2 overflow-x-auto border-b border-border"
      >
        {[
          {
            to: "/account/integrations/plugins",
            label: "mcp_plugin_install" as const,
            Icon: Blocks,
          },
          {
            to: "/account/integrations/manual",
            label: "mcp_manual_install" as const,
            Icon: BookOpen,
          },
          { to: "/account/mcp-sessions", label: "mcp_oauth_sessions" as const, Icon: KeyRound },
        ].map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-base data-[status=active]:border-primary data-[status=active]:font-semibold"
          >
            <Icon className="size-5" />
            {t(label)}
          </Link>
        ))}
      </nav>
      {children}
    </SettingsShell>
  );
}
