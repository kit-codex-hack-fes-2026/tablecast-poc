/** 検証失敗した入力の祖先だけを展開する。DOMとフォームの値は保持する。 */
export function revealDisclosureTarget(target: Pick<HTMLElement, "parentElement">) {
  let parent = target.parentElement;
  while (parent) {
    if (parent.matches('[data-slot="disclosure"]:not([data-open])')) {
      parent.querySelector<HTMLButtonElement>(':scope > [data-slot="disclosure-trigger"]')?.click();
    }
    parent = parent.parentElement;
  }
}
