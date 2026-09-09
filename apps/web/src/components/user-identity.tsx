import { Avatar } from "@base-ui/react/avatar";
import { tv } from "tailwind-variants";

const userAvatar = tv({
  base: "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-foreground ring-1 ring-border",
  variants: { compact: { true: "size-9 text-sm", false: "size-11 text-base" } },
});

export function UserIdentity({
  user,
  compact = false,
}: {
  user: { name: string; email?: string; image?: string | null };
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar.Root className={userAvatar({ compact })}>
        <Avatar.Image src={user.image ?? undefined} alt="" className="size-full object-cover" />
        <Avatar.Fallback>{user.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
      </Avatar.Root>
      <div className="min-w-0">
        <p className="truncate text-base font-medium">{user.name}</p>
        {user.email && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}
      </div>
    </div>
  );
}
