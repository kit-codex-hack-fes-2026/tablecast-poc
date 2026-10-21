import type { VoiceRuntime } from "./voice-runtime";
import { delegationEvent, responseEnvelope, transcriptEvent } from "./voice-events-model";
export function updateSpeechSpeed(runtime: VoiceRuntime) {
  if (!runtime.ready || !runtime.desired || runtime.speechSpeed === runtime.requestedSpeechSpeed)
    return;
  runtime.channel?.send(
    JSON.stringify({
      type: "session.instructions.append",
      event_id: crypto.randomUUID(),
      delegation_id: null,
      content: `話速の希望は${runtime.requestedSpeechSpeed}倍相当です。次の発話から反映してください。`,
    }),
  );
  runtime.speechSpeed = runtime.requestedSpeechSpeed;
}

export async function closeTransport(
  runtime: VoiceRuntime,
  peer?: RTCPeerConnection,
  channel?: RTCDataChannel,
) {
  try {
    if (channel?.readyState === "open")
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timeout);
          channel.removeEventListener("message", received);
          channel.removeEventListener("close", finish);
          resolve();
        };
        const received = ({ data }: MessageEvent<unknown>) => {
          if (typeof data !== "string") return;
          try {
            const event: unknown = JSON.parse(data);
            if (
              event &&
              typeof event === "object" &&
              "type" in event &&
              event.type === "session.closed"
            )
              finish();
          } catch {
            /* 不正な通知で終了を確定しない。 */
          }
        };
        const timeout = setTimeout(finish, 1500);
        channel.addEventListener("message", received);
        channel.addEventListener("close", finish);
        channel.send(JSON.stringify({ type: "session.close" }));
      });
  } finally {
    channel?.close();
    peer?.close();
  }
}

export async function openTransport(runtime: VoiceRuntime, attempt: number) {
  const peer = new RTCPeerConnection();
  runtime.peer = peer;
  const audio = new Audio();
  audio.autoplay = true;
  runtime.audio = audio;
  peer.addEventListener("track", ({ track }) => {
    if (!runtime.current(attempt) || track.kind !== "audio") return;
    audio.srcObject = new MediaStream([track]);
    runtime.emit({ outputTrack: track });
    void audio.play().catch(() => runtime.fail(attempt));
  });
  peer.addEventListener("connectionstatechange", () => {
    if (peer.connectionState === "failed" || peer.connectionState === "closed")
      void runtime.fail(attempt);
  });
  const channel = peer.createDataChannel("oai-events");
  runtime.channel = channel;
  channel.addEventListener("message", ({ data }) => {
    if (!runtime.current(attempt) || typeof data !== "string" || data.length > 64000) return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (!event || typeof event !== "object" || !("type" in event)) return;
    if (event.type === "session.started") {
      clearTimeout(runtime.readyTimer);
      runtime.ready = true;
      runtime.emit({ status: "listening" });
      runtime.updateSpeechSpeed();
      runtime.scheduleProactive(attempt);
    } else if (event.type === "session.closed" || event.type === "error") {
      void runtime.fail(attempt);
    } else {
      const transcript = transcriptEvent.safeParse(event);
      if (transcript.success) runtime.receiveCaption(transcript.data, attempt);
      else {
        const delegation = delegationEvent.safeParse(event);
        if (delegation.success) {
          const id = delegation.data.delegation.id;
          if (!runtime.delegations.has(id)) {
            runtime.activeDelegation = id;
            runtime.delegation?.abort();
            runtime.delegation = undefined;
            runtime.delegations.set(id, runtime.registerDelegation(id, "user", attempt));
          }
        } else {
          const envelope = responseEnvelope.safeParse(event);
          if (envelope.success) void runtime.receiveResponse(envelope.data, attempt);
        }
      }
    }
  });
  channel.addEventListener("close", () => void runtime.fail(attempt));
  channel.addEventListener("error", () => void runtime.fail(attempt));
  const microphone = await runtime.captureMicrophone(runtime.microphoneView.selectedId);
  if (!runtime.current(attempt)) {
    microphone.getTracks().forEach((track) => track.stop());
    peer.close();
    return undefined;
  }
  runtime.microphone = microphone;
  const track = microphone.getAudioTracks()[0];
  if (!track) throw new DOMException("Microphone has no audio track", "NotFoundError");
  runtime.microphoneSender = peer.addTrack(track, microphone);
  runtime.observeMicrophone(microphone, attempt);
  runtime.updateMicrophone({ activeLabel: track.label, error: undefined });
  runtime.emit({ inputTrack: track });
  void runtime.refreshMicrophones();
  await peer.setLocalDescription(await peer.createOffer());
  if (peer.iceGatheringState !== "complete")
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", changed);
        resolve();
      };
      const changed = () => {
        if (peer.iceGatheringState === "complete") done();
      };
      const timeout = setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", changed);
        reject(new Error("音声接続候補の取得が期限を超えた"));
      }, 10000);
      peer.addEventListener("icegatheringstatechange", changed);
      changed();
    });
  if (!runtime.current(attempt)) return undefined;
  const sdp = peer.localDescription?.sdp;
  if (!sdp) throw new Error("音声接続候補を取得できなかった");

  return { peer, sdp };
}
