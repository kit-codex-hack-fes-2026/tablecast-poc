import { surfaceMotion } from "./motion-variants";
import { StyleScopeBoundary } from "./style-scope";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn, tv, type VariantProps } from "tailwind-variants";
import type { ComponentProps } from "react";
import { Button } from "./button";

const dialogVariants = tv({
  slots: {
    viewport: "fixed inset-0 z-41 flex data-ending-style:pointer-events-none",
    popup: "flex flex-col bg-card shadow-2xl",
  },
  variants: {
    side: {
      center: {
        viewport: "items-center justify-center p-6 max-sm:p-3",
        popup: "max-h-full w-full max-w-xl rounded-xl p-6 max-sm:p-5",
      },
      right: { viewport: "justify-end", popup: "max-w-3xl px-6 pt-6 max-sm:px-5 size-full" },
      left: { viewport: "justify-start", popup: "max-w-3xl px-6 pt-6 max-sm:px-5 size-full" },
    },
  },
  defaultVariants: { side: "center" },
});

export const Dialog = DialogPrimitive.Root;
export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      {...props}
      className={cn("mb-2 text-xl font-semibold leading-snug tracking-tight", className)}
    />
  );
}
export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      {...props}
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    />
  );
}

/**
 * 短い確認や詳細を重ねて表示する。
 * Dialogにopen/onOpenChange、DialogContentにside(center/right/left)とinitialFocus/finalFocusを渡す。
 * Header内のTitle、Description、Close、Scroll、Footerを組み合わせる。
 * 閉じるアイコンにはaria-labelが必須。
 * 長い内容はScrollへ置き、操作を隠さない。
 * 破壊操作にはConfirmActionを使う。
 * Portalのテーマは内部で引き継ぐ。
 */
export function DialogContent({
  className,
  side = "center",
  ...props
}: DialogPrimitive.Popup.Props & VariantProps<typeof dialogVariants>) {
  const { viewport, popup } = dialogVariants({ side });
  return (
    <DialogPrimitive.Portal>
      <StyleScopeBoundary>
        <DialogPrimitive.Backdrop
          className={cn("fixed inset-0 bg-overlay z-40", surfaceMotion({ kind: "backdrop" }))}
        />
        <DialogPrimitive.Viewport className={viewport()}>
          <DialogPrimitive.Popup
            render={(renderProps, state) => (
              <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
            )}
            {...props}
            data-slot="dialog-content"
            data-theme-part="dialog"
            className={(state) =>
              popup({
                className: cn(
                  surfaceMotion({ kind: side === "center" ? "dialog" : side }),
                  typeof className === "function" ? className(state) : className,
                ),
              })
            }
          />
        </DialogPrimitive.Viewport>
      </StyleScopeBoundary>
    </DialogPrimitive.Portal>
  );
}
export function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close render={<Button variant="ghost" size="icon" />} {...props} />;
}
export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "mb-2 flex items-center justify-between gap-3 [&_[data-slot=button]]:-my-2.5 [&_[data-slot=button]]:-mr-2.5",
        className,
      )}
      {...props}
    />
  );
}
export function DialogScroll({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-scroll"
      className={cn("overflow-y-auto flex-1 min-h-0 mt-4 scrollbar-thin", className)}
      {...props}
    />
  );
}
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "mt-4 flex items-center justify-between gap-4 [&>[data-slot=button]]:flex-1 border-t border-border pt-5 max-sm:gap-2.5",
        className,
      )}
      {...props}
    />
  );
}
