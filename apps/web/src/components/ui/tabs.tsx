import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn, type VariantProps } from "tailwind-variants";
import { tabVariants } from "./tab-variants";

/** タブの選択・キーボード操作はBase UI、面と操作の区別はこの共通部品が所有する。 */

export const Root = TabsPrimitive.Root;
export const Panel = TabsPrimitive.Panel;
export const Indicator = TabsPrimitive.Indicator;

export function List({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      {...props}
      className={(state) =>
        cn(
          "flex w-fit max-w-full flex-wrap gap-2 rounded-2xl bg-surface-subtle p-2 shadow-inner",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

export function Tab({
  className,
  size,
  ...props
}: TabsPrimitive.Tab.Props & VariantProps<typeof tabVariants>) {
  return (
    <TabsPrimitive.Tab
      {...props}
      className={(state) =>
        tabVariants({
          size,
          className: typeof className === "function" ? className(state) : className,
        })
      }
    />
  );
}
