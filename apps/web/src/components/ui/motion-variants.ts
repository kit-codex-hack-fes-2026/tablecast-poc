import { tv } from "tailwind-variants";

/** 色は各部品が所有し、操作への応答だけを共有する。focusは遷移対象にしない。 */
export const controlMotion =
  "transition-[color,background-color,border-color,box-shadow,text-decoration-color] duration-(--motion-hover) ease-(--motion-ease-out) active:duration-(--motion-press) focus-visible:transition-[color,background-color,text-decoration-color] motion-reduce:transition-none";

/** Base UIの入退場属性で途中反転とfocus管理を維持する。 */
export const surfaceMotion = tv({
  base: "transition-[opacity,transform] ease-(--motion-ease-out) data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:pointer-events-none motion-reduce:transition-none",
  variants: {
    kind: {
      popup:
        "origin-(--transform-origin) duration-(--motion-popup) motion-safe:data-starting-style:[transform:scale(.98)] motion-safe:data-ending-style:[transform:scale(.98)]",
      dialog:
        "duration-(--motion-dialog) motion-safe:data-starting-style:[transform:translateY(8px)_scale(.98)] motion-safe:data-ending-style:[transform:translateY(8px)_scale(.98)]",
      right:
        "duration-(--motion-dialog) motion-safe:data-starting-style:[transform:translateX(24px)] motion-safe:data-ending-style:[transform:translateX(24px)]",
      left: "duration-(--motion-dialog) motion-safe:data-starting-style:[transform:translateX(-24px)] motion-safe:data-ending-style:[transform:translateX(-24px)]",
      backdrop: "duration-(--motion-dialog)",
      scale:
        "duration-(--motion-dialog) motion-safe:data-starting-style:[transform:scale(.98)] motion-safe:data-ending-style:[transform:scale(.98)]",
    },
  },
  defaultVariants: { kind: "popup" },
});

/** 実データ・編集欄の開閉専用。説明だけの折りたたみには使わない。 */
export const disclosureMotion =
  "h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-(--motion-state) ease-(--motion-ease-out) data-starting-style:h-0 data-ending-style:h-0 data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:pointer-events-none motion-reduce:transition-none";
