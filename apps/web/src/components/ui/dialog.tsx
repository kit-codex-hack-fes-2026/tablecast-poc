import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn, tv, type VariantProps } from "tailwind-variants";
import type { ComponentProps } from "react";
import { Button } from "./button";

const dialogVariants = tv({
  slots: {
    viewport: "fixed inset-0 z-41 flex",
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

export function DialogContent({
  className,
  side = "center",
  ...props
}: DialogPrimitive.Popup.Props & VariantProps<typeof dialogVariants>) {
  const { viewport, popup } = dialogVariants({ side });
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 bg-foreground/35 backdrop-blur-xs z-40" />
      <DialogPrimitive.Viewport className={viewport()}>
        <DialogPrimitive.Popup
          {...props}
          data-slot="dialog-content"
          className={(state) =>
            popup({ className: typeof className === "function" ? className(state) : className })
          }
        />
      </DialogPrimitive.Viewport>
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
