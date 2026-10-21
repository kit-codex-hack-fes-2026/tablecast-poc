import type { VoiceRuntime } from "./voice-runtime";
import { type MicrophoneError, type MicrophoneView } from "./voice-model";
export function observeMicrophones(runtime: VoiceRuntime) {
  const refresh = () => {
    void runtime.refreshMicrophones();
  };
  navigator.mediaDevices?.addEventListener("devicechange", refresh);
  refresh();
  return () => {
    ++runtime.deviceRequest;
    navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  };
}

export async function refreshMicrophones(runtime: VoiceRuntime) {
  const request = ++runtime.deviceRequest;
  if (!navigator.mediaDevices?.enumerateDevices) {
    runtime.updateMicrophone({ error: "unsupported", loading: false }, "devices");
    return;
  }
  runtime.updateMicrophone({ loading: true });
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    if (request !== runtime.deviceRequest) return;
    const devices = all.filter((device) => device.kind === "audioinput");
    const named = devices.some((device) => Boolean(device.label));
    const missing =
      named &&
      runtime.microphoneView.selectedId !== "default" &&
      !devices.some((device) => device.deviceId === runtime.microphoneView.selectedId);
    let error: MicrophoneError | undefined;
    if (missing) {
      error = "disconnected";
    } else if (devices.length === 0) {
      error = "empty";
    }
    runtime.updateMicrophone(
      {
        devices: devices.filter((device) => device.deviceId),
        loading: false,
        permissionRequired: !named,
        limited:
          !navigator.mediaDevices.getSupportedConstraints().deviceId ||
          (named && devices.filter((device) => device.deviceId !== "default").length < 2),
        ...(error || runtime.microphoneErrorSource === "devices" ? { error } : {}),
      },
      "devices",
    );
    if (missing && runtime.desired) await runtime.stop();
  } catch (error) {
    if (request === runtime.deviceRequest)
      runtime.updateMicrophone({ loading: false, error: microphoneError(error) }, "devices");
  }
}

export async function selectMicrophone(runtime: VoiceRuntime, deviceId: string) {
  if (runtime.view.status === "connecting" || runtime.microphoneView.switching) return;
  const microphone = runtime.microphone;
  const sender = runtime.microphoneSender;
  if (!runtime.desired || !microphone || !sender) {
    runtime.updateMicrophone({ selectedId: deviceId, error: undefined });
    return;
  }
  const attempt = runtime.attempt;
  runtime.updateMicrophone({ switching: true, error: undefined });
  let replacement: MediaStream | undefined;
  try {
    replacement = await runtime.captureMicrophone(deviceId);
    if (!runtime.current(attempt)) {
      replacement.getTracks().forEach((source) => source.stop());
      return;
    }
    runtime.switchingMicrophone = replacement;
    const track = replacement.getAudioTracks()[0];
    if (!track) throw new DOMException("Microphone has no audio track", "NotFoundError");
    await sender.replaceTrack(track);
    if (!runtime.current(attempt)) {
      replacement.getTracks().forEach((source) => source.stop());
      return;
    }
    runtime.microphone = replacement;
    runtime.observeMicrophone(replacement, attempt);
    microphone.getTracks().forEach((source) => source.stop());
    runtime.updateMicrophone({ selectedId: deviceId, activeLabel: track.label });
    runtime.emit({ inputTrack: track });
    void runtime.refreshMicrophones();
  } catch (error) {
    replacement?.getTracks().forEach((track) => track.stop());
    if (!runtime.current(attempt)) return;
    await runtime.stop();
    runtime.updateMicrophone({ error: microphoneError(error) });
  } finally {
    if (runtime.switchingMicrophone === replacement) runtime.switchingMicrophone = undefined;
    if (runtime.current(attempt)) runtime.updateMicrophone({ switching: false });
  }
}

export async function captureMicrophone(runtime: VoiceRuntime, deviceId: string) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId === "default" ? {} : { deviceId: { exact: deviceId } }),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  if (deviceId !== "default" && stream.getAudioTracks()[0]?.getSettings().deviceId !== deviceId) {
    stream.getTracks().forEach((track) => track.stop());
    throw new DOMException("Microphone selection was not applied", "NotSupportedError");
  }
  return stream;
}

export function observeMicrophone(runtime: VoiceRuntime, stream: MediaStream, attempt: number) {
  stream.getAudioTracks()[0]?.addEventListener(
    "ended",
    () => {
      if (!runtime.current(attempt) || runtime.microphone !== stream) return;
      void runtime.stop();
      runtime.updateMicrophone({ error: "disconnected" });
    },
    { once: true },
  );
}

export function updateMicrophone(
  runtime: VoiceRuntime,
  change: Partial<MicrophoneView>,
  errorSource: "capture" | "devices" = "capture",
) {
  if ("error" in change) runtime.microphoneErrorSource = change.error ? errorSource : undefined;
  runtime.microphoneView = { ...runtime.microphoneView, ...change };
  runtime.emit({ microphone: runtime.microphoneView });
}
export function microphoneError(error: unknown): MicrophoneError {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") return "permission";
    if (error.name === "NotSupportedError") return "unsupported";
    if (error.name === "NotFoundError") return "empty";
    if (error.name === "OverconstrainedError") return "disconnected";
  }
  return "failed";
}
