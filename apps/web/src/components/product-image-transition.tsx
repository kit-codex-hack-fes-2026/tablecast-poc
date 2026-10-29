import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";

/** 一覧と詳細の写真を、同じTabsのLayoutGroup内で結ぶ。 */
export function ProductImageTransition({
  children,
  className,
  enabled,
  productId,
  radius = 12,
}: {
  children: ReactNode;
  className?: string;
  enabled: boolean;
  productId: string;
  radius?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      data-ui="product-image-transition"
      layoutId={enabled && !reduced ? `product-image-${productId}` : undefined}
      transition={{ duration: 0.22, ease: [0.77, 0, 0.175, 1] }}
      style={{ borderRadius: radius }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
