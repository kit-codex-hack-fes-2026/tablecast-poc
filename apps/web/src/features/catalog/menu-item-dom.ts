import { revealDisclosureTarget } from "../../components/ui/disclosure-target";

export function focusInvalidCondition(form: HTMLFormElement, aggregate: boolean) {
  const invalid =
    form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    (aggregate
      ? form.querySelector<HTMLElement>("[data-condition-editor] [data-node-control]")
      : null);
  if (!invalid) return;
  revealDisclosureTarget(invalid);
  requestAnimationFrame(() => {
    if (invalid.isConnected) invalid.focus();
  });
}
