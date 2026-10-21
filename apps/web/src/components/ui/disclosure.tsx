import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronRight } from "lucide-react";
import { cn } from "tailwind-variants";
import { revealDisclosureTarget } from "./disclosure-target";
import { controlMotion, disclosureMotion } from "./motion-variants";

export function Root({ onInvalidCapture, ...props }: Collapsible.Root.Props) {
  return (
    <Collapsible.Root
      {...props}
      data-slot="disclosure"
      onInvalidCapture={(event) => {
        onInvalidCapture?.(event);
        const field = event.target;
        if (
          !(
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement
          )
        )
          return;
        if (event.currentTarget.hasAttribute("data-open")) return;
        event.preventDefault();
        revealDisclosureTarget(field);
        requestAnimationFrame(() => {
          if (!field.isConnected) return;
          field.focus();
          field.reportValidity();
        });
      }}
    />
  );
}

export function Trigger({ className, children, ...props }: Collapsible.Trigger.Props) {
  return (
    <Collapsible.Trigger
      {...props}
      data-slot="disclosure-trigger"
      className={(state) =>
        cn(
          controlMotion,
          "group/disclosure-trigger flex min-h-11 w-full items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 transition-transform duration-(--motion-state) ease-(--motion-ease-out) group-aria-expanded/disclosure-trigger:rotate-90 motion-reduce:transition-none"
      />
      {children}
    </Collapsible.Trigger>
  );
}

export function Panel({ className, ...props }: Collapsible.Panel.Props) {
  return (
    <Collapsible.Panel
      {...props}
      keepMounted
      render={(renderProps, state) => (
        <div {...renderProps} inert={!state.open} aria-hidden={!state.open || undefined} />
      )}
      className={(state) =>
        cn(disclosureMotion, typeof className === "function" ? className(state) : className)
      }
    />
  );
}
