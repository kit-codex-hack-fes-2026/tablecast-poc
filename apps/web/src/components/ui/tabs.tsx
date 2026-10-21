import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { AnimatePresence, LayoutGroup, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useId } from "react";
import { cn, type VariantProps } from "tailwind-variants";
import { tabVariants } from "./tab-variants";

/** Base UIが選択とmount状態を所有し、LayoutGroupは選択位置だけを共有する。 */
export function Root(props: TabsPrimitive.Root.Props) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <TabsPrimitive.Root {...props} />
    </LayoutGroup>
  );
}

export function Tab({
  className,
  size,
  ...props
}: Omit<TabsPrimitive.Tab.Props, "render"> & VariantProps<typeof tabVariants>) {
  const reduced = useReducedMotion();
  return (
    <TabsPrimitive.Tab
      {...props}
      render={(renderProps, state) => (
        <button {...renderProps}>
          {renderProps.children}
          <AnimatePresence initial={false}>
            {state.active && (
              <m.span
                key="selection"
                aria-hidden
                data-slot="tab-selection"
                layoutId="tab-selection"
                initial={false}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.2, ease: [0.23, 1, 0.32, 1] }}
                className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-control-edge-hover shadow-control"
              />
            )}
          </AnimatePresence>
        </button>
      )}
      className={(state) =>
        tabVariants({
          size,
          className: typeof className === "function" ? className(state) : className,
        })
      }
    />
  );
}

export function Panel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      {...props}
      className={(state) =>
        cn(
          // 旧panelを直ちに外し、次のpanelだけを選択方向から入れる。DOM保持はcallerの契約に従う。
          "transition-[opacity,transform] duration-(--motion-state) ease-(--motion-ease-out) data-starting-style:opacity-0 data-ending-style:hidden motion-reduce:transition-none",
          state.tabActivationDirection === "right" &&
            "motion-safe:data-starting-style:translate-x-2",
          state.tabActivationDirection === "left" &&
            "motion-safe:data-starting-style:-translate-x-2",
          state.tabActivationDirection === "down" &&
            "motion-safe:data-starting-style:translate-y-2",
          state.tabActivationDirection === "up" && "motion-safe:data-starting-style:-translate-y-2",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

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
export const Indicator = TabsPrimitive.Indicator;
