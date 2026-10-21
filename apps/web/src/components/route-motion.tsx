import { useRouter } from "@tanstack/react-router";
import { useAnimate, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { routeMotionDirection, supportsPageTransition } from "../lib/route-motion";

/** 未対応ブラウザーでも既存surfaceだけを動かし、Outletと入力の寿命を保つ。 */
export function RouteMotion() {
  const router = useRouter();
  const [, animate] = useAnimate();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || supportsPageTransition()) return undefined;
    let frame = 0;
    let animation: ReturnType<typeof animate> | undefined;
    const unsubscribe = router.subscribe("onResolved", (event) => {
      cancelAnimationFrame(frame);
      animation?.complete();
      const direction = routeMotionDirection(event);
      if (!direction) return;
      // onResolved後にcommitされた本文を読む。旧ページやportalは複製しない。
      frame = requestAnimationFrame(() => {
        const surface = document.querySelector<HTMLElement>("[data-page-motion]");
        if (!surface) return;
        const next = animate(
          surface,
          { opacity: [0.6, 1], transform: [`translateX(${direction * 8}px)`, "none"] },
          { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
        );
        animation = next;
        void next.then(() => {
          // 補間後のidentity transformを残してfixed要素の基準を変えない。
          if (animation === next) surface.style.removeProperty("transform");
        });
      });
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      animation?.complete();
    };
  }, [animate, reduced, router]);
  return null;
}
