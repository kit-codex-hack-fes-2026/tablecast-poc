import { Avatar } from "@base-ui/react/avatar";
import { UserRound } from "lucide-react";
import { tv } from "tailwind-variants";
import { useI18n } from "../i18n/locale";

const userAvatar = tv({
  base: "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground ring-1 ring-border",
  variants: { compact: { true: "size-9", false: "size-11" } },
});

/** 人物は丸いアイコン、名前、メールを一組で表示する。セレクタだけはtruncateを使い、開いた詳細に全文を残す。 */
export function UserIdentity({
  user,
  compact = false,
  truncate = false,
}: {
  compact?: boolean;
  truncate?: boolean;
  user: { email: null | string; image?: null | string; name?: null | string };
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
          <span
            className={`block text-base font-medium ${truncate ? "truncate" : "wrap-anywhere"}`}
          >
            {user.name}
          </span>
        )}
        <span
          className={`block text-sm text-muted-foreground ${truncate ? "truncate" : "wrap-anywhere"}`}
        >
          {user.email ?? t("identity_email_unavailable")}
        </span>
      </span>
    </span>
  );
}

/** 客向けの同席者。共有が許可された名前と画像を使い、メールは取得しない。 */
export function ParticipantIdentity({
  image,
  name,
}: {
  image?: null | string;
  name: null | string;
}) {
  const { t } = useI18n();
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <ParticipantAvatar image={image} />
      <span className="wrap-anywhere">{name ?? t("customer_anonymous")}</span>
    </span>
  );
}

/** 同席共有を許可された会員画像を表示し、非共有・未設定は人物アイコンにする。 */
export function ParticipantAvatar({ image }: { image?: null | string }) {
  return (
    <Avatar.Root className={userAvatar({ compact: true })} aria-hidden="true">
      <Avatar.Image src={image ?? undefined} alt="" className="size-full object-cover" />
      <Avatar.Fallback>
        <UserRound className="size-5" />
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
