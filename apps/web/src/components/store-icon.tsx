import { Avatar } from "@base-ui/react/avatar";
import { cn } from "cn";

export function StoreIcon({
  name,
  logo,
  className,
}: {
  name: string;
  logo?: string | null;
  className?: string;
}) {
  return (
    <Avatar.Root
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary font-semibold text-foreground ring-1 ring-border",
        className,
      )}
    >
      <Avatar.Image src={logo ?? undefined} alt="" className="size-full object-cover" />
      <Avatar.Fallback>{name.slice(0, 1)}</Avatar.Fallback>
    </Avatar.Root>
  );
}
