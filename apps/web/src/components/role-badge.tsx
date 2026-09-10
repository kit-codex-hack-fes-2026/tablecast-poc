import { tv } from "tailwind-variants";
import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "./ui/badge";
import { useI18n } from "../i18n/locale";

const roleBadge = tv({
  base: "bg-secondary text-foreground",
  variants: {
    owner: { true: "bg-primary text-primary-foreground" },
    admin: { true: "bg-accent-soft text-foreground" },
  },
});

export function RoleBadge({ role }: { role: string }) {
  const { t } = useI18n();
  return (
    <Badge
      variant="outline"
      className={roleBadge({ owner: role === "owner", admin: role === "admin" })}
    >
      {role === "owner" ? <Crown /> : role === "admin" ? <ShieldCheck /> : <UserRound />}
      {t(role === "owner" ? "org_owner" : role === "admin" ? "org_admin" : "org_member")}
    </Badge>
  );
}
