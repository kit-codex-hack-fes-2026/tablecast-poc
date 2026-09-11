import { useId } from "react";
import { demoDevices } from "./demo-device-model";

// Appleの配布画像は使わず、正面の筐体・レンズ・ボタンをSVGで描く。
export function DemoDeviceFrame({
  device,
  portrait,
}: {
  device: keyof typeof demoDevices;
  portrait: boolean;
}) {
  const id = useId();
  const { width, height, bezel, silver } = demoDevices[device];
  const bodyWidth = width + bezel * 2;
  const bodyHeight = height + bezel * 2;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid="demo-device-frame"
      className="pointer-events-none absolute left-1/2 top-1/2 max-w-none drop-shadow-xl"
      width={bodyWidth + 12}
      height={bodyHeight + 12}
      viewBox={`0 0 ${bodyWidth + 12} ${bodyHeight + 12}`}
      style={{ transform: `translate(-50%, -50%) rotate(${portrait ? 0 : -90}deg)` }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={silver ? "#f5f6f7" : "#aeb1b5"} />
          <stop offset="0.35" stopColor={silver ? "#afb5bc" : "#656a70"} />
          <stop offset="0.65" stopColor={silver ? "#e5e7ea" : "#b0b3b7"} />
          <stop offset="1" stopColor={silver ? "#aeb4bc" : "#5f6369"} />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`} stroke="#71767d" strokeWidth="1">
        <rect x="82" y="2" width="48" height="8" rx="3" />
        <rect x={bodyWidth + 3} y="110" width="7" height="42" rx="3" />
        <rect x={bodyWidth + 3} y="166" width="7" height="42" rx="3" />
        <rect x="6" y="6" width={bodyWidth} height={bodyHeight} rx="54" />
      </g>
      <rect x="10" y="10" width={bodyWidth - 8} height={bodyHeight - 8} rx="50" fill="#090a0c" />
      <rect
        x="13"
        y="13"
        width={bodyWidth - 14}
        height={bodyHeight - 14}
        rx="47"
        fill="#17181b"
        stroke="#27292d"
      />
      <circle
        cx={bodyWidth + 6 - bezel / 2}
        cy={bodyHeight / 2 + 6}
        r="6"
        fill="#08090b"
        stroke="#2b2d32"
      />
      <circle cx={bodyWidth + 6 - bezel / 2} cy={bodyHeight / 2 + 6} r="2.5" fill="#162438" />
      <circle cx={bodyWidth + 5 - bezel / 2} cy={bodyHeight / 2 + 5} r="1" fill="#344656" />
      <circle cx={bodyWidth + 6 - bezel / 2} cy={bodyHeight / 2 - 20} r="1.5" fill="#08090b" />
    </svg>
  );
}
