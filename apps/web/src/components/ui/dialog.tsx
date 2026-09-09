import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { Button } from "./button";

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
}: DialogPrimitive.Popup.Props & { side?: "center" | "right" | "left" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 bg-foreground/35 backdrop-blur-xs z-40" />
      <DialogPrimitive.Viewport
        className={
          side !== "center"
            ? `fixed inset-0 z-41 flex ${side === "right" ? "justify-end" : "justify-start"}`
            : "fixed inset-0 flex items-center justify-center p-6 z-41 max-sm:p-3"
        }
      >
        <DialogPrimitive.Popup
          {...props}
          data-slot="dialog-content"
          className={(state) =>
            cn(
              side !== "center"
                ? "flex h-full w-full max-w-3xl flex-col bg-card px-6 pt-6 shadow-2xl max-sm:px-5"
                : "flex max-h-full w-full max-w-xl flex-col rounded-xl bg-card p-6 shadow-2xl max-sm:p-5",

              typeof className === "function" ? className(state) : className,
            )
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
      className={cn("overflow-y-auto flex-1 min-h-0 mt-4 [scrollbar-width:thin]", className)}
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
