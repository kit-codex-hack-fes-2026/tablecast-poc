import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Blocks, BookOpen, KeyRound } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { useI18n } from "../../i18n/locale";
import { SettingsShell } from "../store/settings-shell";

export function IntegrationsShell({
  children,
  publicGuide = false,
}: {
  children: ReactNode;
  publicGuide?: boolean;
}) {
  const { t } = useI18n();
  return (
    <SettingsShell publicContent={publicGuide}>
      <PageHeader title={t("mcp_sessions")} icon={<Blocks />} />
      <nav
        aria-label={t("mcp_sessions")}
        className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border"
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
            className="inline-flex min-h-11 min-w-0 items-center gap-2 border-b-2 border-transparent py-2 text-sm data-[status=active]:border-primary data-[status=active]:font-semibold [&_svg]:shrink-0"
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
