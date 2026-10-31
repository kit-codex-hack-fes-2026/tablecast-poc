import { Avatar } from "@base-ui/react/avatar";
import { cn } from "tailwind-variants";

/**
 * 店舗一覧の小さい識別画像。
 * nameが必須、logoは任意のURL、classNameは配置に使う。
 * 画像なしは頭文字。
 * 隣に店舗名を必ず置き、単独の文字省略で店を識別させない。
 * 横長のブランドロゴにはStoreLogoを使う。
 */
export function StoreIcon({
  name,
  logo,
  className,
}: {
  className?: string;
  logo?: null | string;
  name: string;
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
