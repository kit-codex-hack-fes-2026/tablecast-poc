import type { RouterEvent } from "@tanstack/react-router";

export function supportsPageTransition() {
  return (
    typeof window !== "undefined" &&
    window.CSS?.supports("selector(:active-view-transition-type(tablecast-forward))")
  );
}

/** snapshotとMotionのfallbackで接客中の除外・戻る方向を共有する。 */
export function routeMotionDirection({
  fromLocation,
  toLocation,
  pathChanged,
}: Pick<RouterEvent, "fromLocation" | "pathChanged" | "toLocation">): -1 | 1 | false {
  if (
    !fromLocation ||
    !pathChanged ||
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    [fromLocation.pathname, toLocation.pathname].some(
      (path) => path === "/" || /\/demo\//.test(path),
    )
  )
    return false;
  return (toLocation.state["__TSR_index"] ?? 0) < (fromLocation.state["__TSR_index"] ?? 0) ? -1 : 1;
}
