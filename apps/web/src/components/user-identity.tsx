import { Avatar } from "@base-ui/react/avatar";
import { UserRound } from "lucide-react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";

const userAvatar = tv({
  base: "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-info-soft text-info ring-1 ring-info/15",
  variants: { compact: { true: "size-9", false: "size-11" } },
});

/** 人物は丸いアイコン、名前、メールを常に一組で表示する。画像がない場合も人物アイコンを使う。メールは省略せず折り返し、取得不能時は短い代替文を表示する。 */
export function UserIdentity({
  user,
  compact = false,
}: {
  user: { name?: string | null; email: string | null; image?: string | null };
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span className="flex min-w-0 items-center gap-3 text-left">
      <Avatar.Root className={userAvatar({ compact })} aria-hidden="true">
        <Avatar.Image src={user.image ?? undefined} alt="" className="size-full object-cover" />
        <Avatar.Fallback>
          <UserRound className="size-5" />
        </Avatar.Fallback>
      </Avatar.Root>
      <span className="min-w-0">
        {user.name && (
          <span className="block text-base font-medium wrap-anywhere">{user.name}</span>
        )}
        <span className="block text-sm text-muted-foreground wrap-anywhere">
          {user.email ?? t("identity_email_unavailable")}
        </span>
      </span>
    </span>
  );
}

/** 客向けの同席者。共有が許可された名前だけを使い、メールやアカウント画像を取得しない。 */
export function ParticipantIdentity({ name }: { name: string | null }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={userAvatar({ compact: true })} aria-hidden="true">
        <UserRound className="size-5" />
      </span>
      <span className="wrap-anywhere">{name ?? t("customer_anonymous")}</span>
    </span>
  );
}
