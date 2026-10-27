import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { createPortal } from "react-dom";
import { ProductImage } from "../../components/product-image";

export type CartFlight = {
  delay?: number;
  destination: "cart" | "orders";
  from: DOMRect;
  id: string;
  imageKey: string;
  to: DOMRect;
};

/** API成功後だけ画像を運ぶ。viewport座標はbodyのportalで描き、paneのcontainmentに切られない。 */
export function CartFlightImage({
  flight,
  onComplete,
}: {
  flight?: CartFlight;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  if (!flight || reduced || typeof document === "undefined") return null;
  const { from, to } = flight;
  const size = Math.min(from.width, from.height, 160);
  const dx = to.left + to.width / 2 - from.left - from.width / 2;
  const dy = to.top + to.height / 2 - from.top - from.height / 2;
  return createPortal(
    <m.div
      key={flight.id}
      aria-hidden
      data-ui={flight.destination === "cart" ? "cart-flight" : "order-flight"}
      className="pointer-events-none fixed z-50 overflow-hidden rounded-lg bg-card shadow-lg"
      style={{
        left: from.left + (from.width - size) / 2,
        top: from.top + (from.height - size) / 2,
        width: size,
        height: size,
        transformOrigin: "center",
      }}
      initial={{ opacity: 1, transform: "translate(0px, 0px) rotate(0deg) scale(1)" }}
      animate={{
        opacity: [1, 1, 0],
        transform: [
          "translate(0px, 0px) rotate(0deg) scale(1)",
          `translate(${dx * 0.35}px, ${Math.min(-56, dy * 0.25 - 80)}px) rotate(${dx < 0 ? -10 : 10}deg) scale(0.85)`,
          `translate(${dx}px, ${dy}px) rotate(0deg) scale(${Math.min(24, size) / size})`,
        ],
      }}
      transition={{
        duration: 0.28,
        delay: flight.delay ?? 0,
        times: [0, 0.35, 1],
        ease: [
          [0.23, 1, 0.32, 1],
          [0.77, 0, 0.175, 1],
        ],
      }}
      onAnimationComplete={onComplete}
    >
      <ProductImage
        priority
        src={`/media/${flight.imageKey}`}
        width={size}
        height={size}
        sizes={`${size}px`}
        alt=""
        className="size-full object-contain"
      />
    </m.div>,
    document.body,
  );
}
