import { tv } from "tailwind-variants";

/** 管理画面と公開ページで、外枠・ページ面・本文の余白を共有する。 */
export const appFrame = tv({ base: "h-dvh bg-secondary/50 md:p-2" });
export const pageSurface = tv({
  base: "h-full min-w-0 overflow-y-auto bg-card md:rounded-2xl md:shadow-surface",
});
export const pageContent = tv({
  base: "mx-auto w-full min-w-0 max-w-7xl space-y-6 @container p-4 sm:p-6 lg:p-8 [view-transition-name:tablecast-page]",
});
