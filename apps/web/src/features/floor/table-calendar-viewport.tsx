import type { TimelinePage, TimelineSession } from "@tablecast/api/schema";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { useEffect, useEffectEvent, useRef } from "react";
import { floorTrackWidth, type FloorZoom } from "./floor-model";

export /** 初期位置・倍率・ホイールを時間軸の一つのスクロール領域に限定する。 */
function useTimelineViewport({
  page,
  sessions,
  now,
  today,
  initialScrollLeft,
  scrollRequest,
  zoom,
  onZoomChange,
}: {
  initialScrollLeft?: number;
  now: number;
  onZoomChange?: (zoom: FloorZoom, options?: { replace?: boolean }) => void;
  page?: Pick<TimelinePage, "date" | "endAt" | "startAt">;
  scrollRequest: number;
  sessions: TimelineSession[];
  today: boolean;
  zoom: FloorZoom;
}) {
  const trackWidth = floorTrackWidth(zoom);
  const viewport = useRef<HTMLDivElement>(null);
  const zoomAnchor = useRef<null | { offset: number; ratio: number }>(null);
  const lastWheel = useRef(-Infinity);
  const wheelDelta = useRef(0);
  const wheelGesture = useRef(false);
  const initialiseScroll = useEffectEvent((request: number) => {
    const element = viewport.current;
    if (!element || !page) return;
    const target = today
      ? now
      : Math.min(
          ...sessions.map((session) => Math.max(session.openedAt, page.startAt)),
          page.endAt,
        );
    const position =
      target === page.endAt
        ? 0
        : Math.max(
            0,
            ((target - page.startAt) / (page.endAt - page.startAt)) * trackWidth -
              element.clientWidth / 2,
          );
    element.scrollLeft = request ? position : (initialScrollLeft ?? position);
  });
  useEffect(() => {
    if (page?.date) initialiseScroll(scrollRequest);
  }, [scrollRequest, page?.date]);
  // 明示的な倍率操作だけを補正し、戻る・進むの位置復元はRouterへ任せる。
  useEffect(() => {
    const element = viewport.current;
    const anchor = zoomAnchor.current;
    if (element && anchor) {
      element.scrollLeft = Math.round(anchor.ratio * trackWidth - anchor.offset);
      zoomAnchor.current = null;
    }
  }, [trackWidth]);
  function changeZoom(next: FloorZoom, options?: { replace?: boolean }, offset?: number) {
    const element = viewport.current;
    if (!element || !onZoomChange || next === zoom) return;
    const anchorOffset = offset ?? element.clientWidth / 2;
    zoomAnchor.current = {
      offset: anchorOffset,
      ratio: Math.min(1, Math.max(0, (element.scrollLeft + anchorOffset) / trackWidth)),
    };
    onZoomChange(next, options);
  }
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = element.clientWidth;
      if (nextWidth !== width) {
        element.scrollLeft += (width - nextWidth) / 2;
        width = nextWidth;
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const zoomWithWheel = useEffectEvent((event: WheelEvent) => {
    const shortcut = detectPlatform() === "mac" ? event.metaKey : event.ctrlKey;
    const element = viewport.current;
    if (!shortcut || !element || !onZoomChange || event.deltaY === 0) return;
    event.preventDefault();
    if (event.timeStamp - lastWheel.current >= 300) {
      wheelDelta.current = 0;
      wheelGesture.current = false;
    }
    lastWheel.current = event.timeStamp;
    wheelDelta.current +=
      event.deltaY *
      (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1);
    const steps = Math.trunc(wheelDelta.current / 100);
    if (!steps) return;
    wheelDelta.current -= steps * 100;
    const next = Math.min(300, Math.max(10, zoom - steps * 10));
    if (next === zoom) return;
    const offset = event.clientX - element.getBoundingClientRect().left;
    changeZoom(next, { replace: wheelGesture.current }, offset);
    wheelGesture.current = true;
  });
  useEffect(() => {
    const element = viewport.current;
    if (!element) return undefined;
    const handleWheel = (event: WheelEvent) => zoomWithWheel(event);
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);
  return { viewport, changeZoom };
}
