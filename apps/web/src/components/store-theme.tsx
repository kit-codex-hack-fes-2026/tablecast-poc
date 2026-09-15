import {
  appearanceSchema,
  themeCssRules,
  themeFonts,
  type Appearance,
} from "@tablecast/api/schema";
import { useId, useMemo, type ReactNode } from "react";

import { StyleScopeProvider, StyleScopeBoundary } from "./ui/style-scope";
function contrastingInk(hex: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.179 ? "#000000" : "#ffffff";
}
function themeStyles(value: Appearance, id: string) {
  const scope = `[data-tablecast-theme="${id}"]`;
  const rule = (part: string, css: string, suffix = "") =>
    `${scope} [data-theme-part="${part}"]${suffix}{${css}}`;
  const colours = value.colours;
  const variables = [
    colours
      ? `--tablecast-theme-ink:${colours.ink};--tablecast-theme-paper:${colours.paper};--tablecast-theme-accent:${colours.accent};--foreground:${colours.ink};--background:${colours.paper};--card:${colours.paper};--card-foreground:${colours.ink};--popover:${colours.paper};--popover-foreground:${colours.ink};--brand-accent:${colours.accent};--accent-foreground:${contrastingInk(colours.accent)};--primary:${colours.accent};--primary-foreground:${contrastingInk(colours.accent)};--ring:${colours.accent};--secondary:color-mix(in srgb,${colours.paper} 92%,${colours.ink});--secondary-foreground:${colours.ink};--muted:var(--secondary);--muted-foreground:color-mix(in srgb,${colours.ink} 80%,${colours.paper});--border:color-mix(in srgb,${colours.ink} 25%,${colours.paper});--input:color-mix(in srgb,${colours.ink} 60%,${colours.paper})`
      : "",
    `--tablecast-font-heading:${themeFonts[value.fonts?.heading ?? "sans"]};--tablecast-font-body:${themeFonts[value.fonts?.body ?? "sans"]}`,
    ...Object.entries(value.assets ?? {}).map(
      ([name, image]) => `--tablecast-image-${name}:url("/media/${image.imageKey}?width=1600")`,
    ),
  ].join(";");
  const parts = Object.entries(value.parts ?? {}).map(([part, style]) => {
    const css = [
      style.background ? `background-color:${style.background}` : "",
      style.foreground
        ? `color:${style.foreground};--foreground:${style.foreground};--card-foreground:${style.foreground};--muted-foreground:${style.foreground}`
        : "",
      style.borderColor ? `border-color:${style.borderColor}` : "",
      style.radius !== undefined ? `border-radius:${style.radius}px` : "",
      style.borderWidth !== undefined
        ? `border-width:${style.borderWidth}px;border-style:solid`
        : "",
      style.font ? `font-family:${themeFonts[style.font]}` : "",
      style.shadow
        ? `box-shadow:${style.shadow === "offset" ? "4px 4px 0 var(--tablecast-theme-ink, #18181b)" : style.shadow === "soft" ? "0 2px 8px #00000022" : "none"}`
        : "",
      style.image
        ? `background-image:linear-gradient(color-mix(in srgb,${(style.background === "transparent" ? "var(--background)" : style.background) ?? "var(--background)"} ${(1 - style.image.opacity) * 100}%,transparent),color-mix(in srgb,${(style.background === "transparent" ? "var(--background)" : style.background) ?? "var(--background)"} ${(1 - style.image.opacity) * 100}%,transparent)),var(--tablecast-image-${style.image.asset});background-size:auto,${style.image.fit === "repeat" ? (style.image.tileSize ? `${style.image.tileSize}px auto` : "auto") : style.image.widthPercent ? `${style.image.widthPercent}% auto` : style.image.fit};background-repeat:no-repeat,${style.image.fit === "repeat" ? "repeat" : "no-repeat"};background-position:center,${style.image.x}% ${style.image.y}%`
        : "",
    ]
      .filter(Boolean)
      .join(";");
    return rule(part, css);
  });
  return `${scope}{${variables};color:var(--foreground);font-family:var(--tablecast-font-body)}${scope} :where(h1,h2,h3){font-family:var(--tablecast-font-heading)}${rule("screen", "font-family:var(--tablecast-font-body);background-color:var(--background);color:var(--foreground)")}${rule("product-card", "font-family:var(--tablecast-font-heading)")}${parts.join("")}${themeCssRules(
    value.customCss ?? "",
    Object.keys(value.assets ?? {}),
  )
    .map((item) => rule(item.part, item.declarations, item.suffix))
    .join("")}`;
}
export function StoreTheme({
  appearance,
  children,
}: {
  appearance?: Appearance;
  children: ReactNode;
}) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9-]/g, "");
  const theme = useMemo(() => {
    if (!appearance) return null;
    const parsed = appearanceSchema.safeParse(appearance);
    return parsed.success ? { id, css: themeStyles(parsed.data, id) } : null;
  }, [appearance, id]);
  return (
    <StyleScopeProvider value={theme}>
      <StyleScopeBoundary>{children}</StyleScopeBoundary>
    </StyleScopeProvider>
  );
}
