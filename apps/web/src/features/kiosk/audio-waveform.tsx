import { animate, mix } from "motion";
import { SmokeRing } from "@paper-design/shaders-react";
import { createAudioAnalyser, type LocalAudioTrack, type RemoteAudioTrack } from "livekit-client";
import {
  AudioLines,
  CircleAlert,
  LoaderCircle,
  Mic,
  MicOff,
  Pause,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { VoiceStatus } from "./voice-connection";

export type VoiceVisualState = VoiceStatus | "tool";

// 色だけに依存せず、中心の記号・輪郭・流れを状態へ対応付ける。
const states = {
  idle: { Icon: Pause, speed: 0, radius: 0.28, thickness: 0.2, noise: 0.7, inner: 0.9 },
  paused: { Icon: Pause, speed: 0, radius: 0.28, thickness: 0.2, noise: 0.7, inner: 0.9 },
  stopping: { Icon: MicOff, speed: 0, radius: 0.25, thickness: 0.15, noise: 0.7, inner: 0.9 },
  error: { Icon: CircleAlert, speed: 0, radius: 0.3, thickness: 0.25, noise: 0.7, inner: 0.9 },
  connecting: {
    Icon: LoaderCircle,
    speed: 0.5,
    radius: 0.28,
    thickness: 0.15,
    noise: 1.2,
    inner: 0.9,
  },
  listening: { Icon: Mic, speed: 0.18, radius: 0.34, thickness: 0.35, noise: 0.9, inner: 0.8 },
  thinking: { Icon: Sparkles, speed: 0.65, radius: 0.24, thickness: 0.8, noise: 1.3, inner: 0.55 },
  tool: { Icon: Wrench, speed: 1.1, radius: 0.35, thickness: 0.12, noise: 1.1, inner: 0.95 },
  speaking: { Icon: AudioLines, speed: 0.75, radius: 0.3, thickness: 0.65, noise: 1.2, inner: 0.7 },
} satisfies Record<VoiceVisualState, object>;
const pearlColors = ["#a5c8ff", "#c4b5fd", "#f9b8db", "#ffd1b8", "#fbcfe8", "#a5def5"];
const monochrome = ["#a1a1aa", "#71717a", "#d4d4d8"];
const errorColors = ["#ad3429", "#f87171", "#71717a"];

function subscribeMotion(callback: () => void) {
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    media.removeEventListener("change", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}
const motionPaused = () =>
  document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AudioWaveform({
  track,
  label,
  state,
  toolLabel,
}: {
  track?: LocalAudioTrack | RemoteAudioTrack;
  label: string;
  state: VoiceVisualState;
  toolLabel?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [audio, setAudio] = useState({ volume: 0, brightness: 0 });
  const still = useSyncExternalStore(subscribeMotion, motionPaused, () => true);
  const preset = states[state];
  const [shape, setShape] = useState({
    speed: preset.speed,
    radius: preset.radius,
    thickness: preset.thickness,
    noise: preset.noise,
    inner: preset.inner,
  });
  const shapeRef = useRef(shape);
  useEffect(() => {
    const target = {
      speed: preset.speed,
      radius: preset.radius,
      thickness: preset.thickness,
      noise: preset.noise,
      inner: preset.inner,
    };
    const interpolate = mix(shapeRef.current, target);
    const animation = animate(0, 1, {
      duration: still || !preset.speed ? 0 : 0.45,
      ease: "easeInOut",
      onUpdate: (progress) => {
        shapeRef.current = interpolate(progress);
        setShape(shapeRef.current);
      },
    });
    return () => animation.stop();
  }, [preset, still]);
  const reactive = !still && (state === "listening" || state === "speaking");
  const volume = reactive ? audio.volume : 0;
  const brightness = reactive ? audio.brightness : 0;
  const { Icon } = preset;
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return undefined;
    const gradient = context.createLinearGradient(0, 0, element.width, 0);
    gradient.addColorStop(0, "#4338ca");
    gradient.addColorStop(0.35, "#c026d3");
    gradient.addColorStop(0.65, "#db2777");
    gradient.addColorStop(1, "#0891b2");
    context.clearRect(0, 0, element.width, element.height);
    context.strokeStyle = gradient;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 24);
    context.lineTo(240, 24);
    context.stroke();
    if (!track || !reactive) return undefined;
    let analysis: ReturnType<typeof createAudioAnalyser>;
    try {
      analysis = createAudioAnalyser(track, { fftSize: 256 });
    } catch {
      return undefined;
    }
    const samples = new Uint8Array(analysis.analyser.fftSize);
    const spectrum = new Uint8Array(analysis.analyser.frequencyBinCount);
    let frame = 0;
    let previous = 0;
    let smoothedVolume = 0;
    let smoothedBrightness = 0;
    function draw(now: number) {
      if (!context || !element) return;
      frame = requestAnimationFrame(draw);
      if (now - previous < 50) return;
      previous = now;
      analysis.analyser.getByteTimeDomainData(samples);
      analysis.analyser.getByteFrequencyData(spectrum);
      const energy = Math.sqrt(
        samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length,
      );
      const total = spectrum.reduce((sum, value) => sum + value, 0);
      const centroid = total
        ? spectrum.reduce((sum, value, index) => sum + value * index, 0) / total / spectrum.length
        : 0;
      smoothedVolume += (Math.min(energy * 3, 1) - smoothedVolume) * 0.25;
      smoothedBrightness += (centroid - smoothedBrightness) * 0.2;
      setAudio({ volume: smoothedVolume, brightness: smoothedBrightness });
      context.clearRect(0, 0, element.width, element.height);
      context.beginPath();
      for (let index = 0; index < samples.length; index++) {
        const x = (index * element.width) / (samples.length - 1);
        const y = (((samples[index] ?? 128) / 128) * element.height) / 2;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      void analysis.cleanup();
    };
  }, [track, reactive]);
  return (
    <figure
      className="flex items-center gap-3 py-1 text-foreground"
      data-voice-state={state}
      data-motion={still || !preset.speed ? "still" : "animated"}
    >
      <div
        aria-hidden="true"
        className="relative size-20 shrink-0 rounded-full bg-white shadow-sm ring-1 ring-black/5"
      >
        <SmokeRing
          className="absolute inset-0 rounded-full blur-xs"
          colors={state === "error" ? errorColors : preset.speed ? pearlColors : monochrome}
          colorBack="#00000000"
          speed={still || !preset.speed ? 0 : shape.speed}
          frame={12000}
          radius={shape.radius + volume * 0.07}
          thickness={shape.thickness + volume * 0.12}
          innerShape={shape.inner}
          noiseScale={shape.noise + brightness}
          noiseIterations={3}
          scale={1}
          minPixelRatio={1}
          maxPixelCount={65536}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon
            className={`size-4 ${state === "error" ? "text-destructive" : "text-foreground"} ${state === "connecting" ? "motion-safe:animate-spin" : ""}`}
          />
        </div>
        {state === "tool" && (
          <span className="absolute inset-1 rounded-full border border-dashed border-foreground/50 motion-safe:animate-spin motion-safe:[animation-duration:6s]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <figcaption className="flex items-center gap-2 text-xs font-semibold">
          {label}
          {toolLabel && (
            <span className="flex items-center gap-1 font-normal">
              <Wrench className="size-3" />
              {toolLabel}
            </span>
          )}
        </figcaption>
        <canvas
          ref={canvas}
          width={240}
          height={48}
          className="h-7 w-full min-w-0"
          aria-hidden="true"
        />
      </div>
    </figure>
  );
}
