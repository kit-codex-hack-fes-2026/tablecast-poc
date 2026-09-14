import { tv, type VariantProps } from "tailwind-variants";

const brand = tv({
  base: "inline-block h-auto shrink-0 object-contain",
  variants: {
    variant: { logo: "w-40", symbol: "w-8" },
  },
  defaultVariants: { variant: "logo" },
});

const source = {
  logo: { black: "tablecast-logo.svg", white: "tablecast-lockup-white.svg" },
  symbol: { black: "tablecast-icon.svg", white: "tablecast-symbol-white.svg" },
};

export function Brand({
  variant = "logo",
  tone = "black",
}: VariantProps<typeof brand> & { tone?: "black" | "white" }) {
  return (
    <img
      src={`/brand/${source[variant][tone]}`}
      width={variant === "logo" ? 500 : 120}
      height={120}
      alt="TableCast"
      className={brand({ variant })}
    />
  );
}
