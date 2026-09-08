import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { useI18n } from "../../i18n/locale";
export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={
        role === "owner"
          ? "bg-primary text-primary-foreground"
          : role === "admin"
            ? "bg-accent-soft text-foreground"
            : "bg-secondary text-foreground"
      }
    >
      {role === "owner" ? <Crown /> : role === "admin" ? <ShieldCheck /> : <UserRound />}
      {t(role === "owner" ? "org_owner" : role === "admin" ? "org_admin" : "org_member")}
    </Badge>
  );
}
