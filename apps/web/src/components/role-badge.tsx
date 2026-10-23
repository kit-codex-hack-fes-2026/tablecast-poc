import { Crown, ShieldCheck, UserRound } from "lucide-react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";
import { Badge } from "./ui/badge";

const roleBadge = tv({
  base: "bg-secondary text-foreground",
  variants: {
    owner: { true: "bg-primary text-primary-foreground" },
    admin: { true: "bg-accent-soft text-foreground" },
  },
});

/**
 * 所属対象の役割を文字と記号で示す。
 * role=owner/admin/memberを渡す。
 * 表示は認可ではなく、操作権限はAPIとfeatureで別に判定する。
 * 任意の業務状態にはBadgeを使う。
 */
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
