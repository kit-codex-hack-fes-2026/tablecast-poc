import {
  Blocks,
  Download,
  ExternalLink,
  FolderGit2,
  Globe,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import connection from "../../../../../plugins/tablecast/.mcp.json";
import skill from "../../../../../plugins/tablecast/skills/tablecast/SKILL.md?raw";
import { CopyValue } from "../../components/copy-value";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { IntegrationsShell } from "./integrations-shell";

const repository = "https://github.com/kit-codex-hack-fes-2026/tablecast-poc";
const packageDocs = "https://learn.chatgpt.com/docs/plugins";
const connectionDocs = "https://learn.chatgpt.com/docs/extend/mcp";

function Guide({
  title,
  icon,
  children,
  source,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  source?: string;
}) {
  const { t } = useI18n();
  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      {children}
      {source && (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 w-fit items-center gap-2 text-sm underline underline-offset-4"
        >
          {t("mcp_official_guide")}
          <ExternalLink className="size-4" />
        </a>
      )}
    </section>
  );
}

export function IntegrationSetup({ mode }: { mode: "plugins" | "manual" }) {
  const { t } = useI18n();
  const endpoint = connection.mcpServers.tablecast.url;
  return (
    <IntegrationsShell>
      {mode === "plugins" ? (
        <>
          <Guide
            title="Marketplace · Codex"
            icon={<Blocks className="size-5" />}
            source={packageDocs}
          >
            <Badge variant="outline">{t("mcp_unpublished")}</Badge>
            <p>{t("mcp_marketplace_steps")}</p>
            <p className="text-sm text-muted-foreground">{t("mcp_repository_status")}</p>
            <CopyValue
              label={t("mcp_repository_install")}
              value="codex plugin marketplace add kit-codex-hack-fes-2026/tablecast-poc"
            />
            <a
              className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4"
              href={repository}
              target="_blank"
              rel="noreferrer"
            >
              <FolderGit2 className="size-5" />
              GitHub
            </a>
          </Guide>
          <Guide
            title={t("mcp_remote_connection")}
            icon={<Globe className="size-5" />}
            source={connectionDocs}
          >
            <ol className="list-decimal space-y-2 pl-5">
              <li>{t("mcp_remote_add")}</li>
              <li>{t("mcp_remote_sign_in")}</li>
              <li>{t("mcp_remote_approve")}</li>
            </ol>
            <CopyValue label={t("mcp_endpoint")} value={endpoint} />
          </Guide>
        </>
      ) : (
        <>
          <Guide title="MCP" icon={<Terminal className="size-5" />} source={connectionDocs}>
            <p>{t("mcp_manual_steps")}</p>
            <CopyValue label={t("mcp_endpoint")} value={endpoint} />
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <dt>{t("mcp_transport")}</dt>
              <dd>Streamable HTTP</dd>
              <dt>{t("mcp_authentication")}</dt>
              <dd>OAuth 2.1 · PKCE · DCR</dd>
              <dt>{t("mcp_resource")}</dt>
              <dd className="break-all">{endpoint}</dd>
            </dl>
            <CopyValue
              label="Codex CLI"
              value={`codex mcp add tablecast --url ${JSON.stringify(endpoint)}\ncodex mcp login tablecast --scopes tablecast:read,tablecast:write --oauth-client-registration dcr`}
            />
          </Guide>
          <Guide title="Agent Skills" icon={<Download className="size-5" />}>
            <p>{t("mcp_skill_steps")}</p>
            <Button
              nativeButton={false}
              role="link"
              render={
                <a
                  aria-label={t("mcp_skill_download")}
                  download="SKILL.md"
                  href={`data:text/markdown;charset=utf-8,${encodeURIComponent(skill)}`}
                />
              }
            >
              <Download />
              {t("mcp_skill_download")}
            </Button>
            <p className="text-sm text-muted-foreground">{t("mcp_skill_requirement")}</p>
          </Guide>
        </>
      )}
      <Guide title={t("mcp_scopes")} icon={<ShieldCheck className="size-5" />}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <dt>
            <Badge variant="outline">tablecast:read</Badge>
          </dt>
          <dd>{t("mcp_scope_read")}</dd>
          <dt>
            <Badge variant="outline">tablecast:write</Badge>
          </dt>
          <dd>{t("mcp_scope_write")}</dd>
        </dl>
        <p className="text-sm text-muted-foreground">{t("mcp_scope_boundary")}</p>
      </Guide>
    </IntegrationsShell>
  );
}
