import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { ProductImage } from "../../components/product-image";

export type CartFlight = {
  from: DOMRect;
  id: string;
  imageKey: string;
  to: DOMRect;
};

/** API成功後だけ画像をカゴへ運び、注文操作や金額の更新を待たせない。 */
export function CartFlightImage({
  flight,
  onComplete,
}: {
  flight?: CartFlight;
  onComplete: () => void;
}) {
  const reduced = useReducedMotion();
  if (!flight || reduced) return null;
  const { from, to } = flight;
  const size = Math.min(from.width, from.height, 160);
  return (
    <m.div
      key={flight.id}
      aria-hidden
      data-ui="cart-flight"
      className="pointer-events-none fixed z-50 overflow-hidden rounded-xl bg-card shadow-lg"
      style={{
        left: from.left,
        top: from.top,
        width: size,
        height: size,
        transformOrigin: "top left",
      }}
      initial={{ opacity: 1, transform: "translate(0px, 0px) scale(1)" }}
      animate={{
        opacity: 0.2,
        transform: `translate(${to.left + to.width / 2 - from.left - 12}px, ${to.top + to.height / 2 - from.top - 12}px) scale(${24 / size})`,
      }}
      transition={{ duration: 0.28, ease: [0.77, 0, 0.175, 1] }}
      onAnimationComplete={onComplete}
    >
      <ProductImage
        src={`/media/${flight.imageKey}`}
        width={160}
        height={160}
        sizes="160px"
        alt=""
        className="size-full object-contain"
      />
    </m.div>
  );
}
