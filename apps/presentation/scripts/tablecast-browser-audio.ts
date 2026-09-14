export function captureBrowserAudio() {
  const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const context = new AudioContext({ sampleRate: 48000 });
  const microphone = context.createMediaStreamDestination();
  // 発話間にも音声のクロックを供給し、合成マイクを無接続にしない。
  const silence = context.createConstantSource();
  silence.offset.value = 0;
  silence.connect(microphone);
  silence.start();
  const recording = context.createMediaStreamDestination();
  silence.connect(recording);
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(recording.stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints?.audio && !constraints.video) {
      await context.resume();
      return microphone.stream.clone();
    }
    return native(constraints);
  };
  const connected = new WeakMap<
    HTMLAudioElement,
    { source: MediaStreamAudioSourceNode; stream: MediaStream }
  >();
  const captureReply = () => {
    for (const element of document.querySelectorAll("audio")) {
      if (!(element.srcObject instanceof MediaStream)) continue;
      const previous = connected.get(element);
      if (previous?.stream === element.srcObject) continue;
      previous?.source.disconnect();
      const source = context.createMediaStreamSource(element.srcObject);
      source.connect(recording);
      connected.set(element, { source, stream: element.srcObject });
    }
  };
  new MutationObserver(captureReply).observe(document, { childList: true, subtree: true });
  // LiveKit再接続時は同じaudio要素のsrcObjectだけが置換される場合がある。
  setInterval(captureReply, 50);
  window.tablecastCapture = {
    events: [],
    startedAt: 0,
    async start() {
      await context.resume();
      captureReply();
      recorder.start(500);
      this.startedAt = Date.now();
      return this.startedAt;
    },
    async speak(base64: string, id: string) {
      await context.resume();
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const buffer = await context.decodeAudioData(bytes.buffer);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(microphone);
      source.connect(recording);
      this.events.push({ id, at: (Date.now() - this.startedAt) / 1000, duration: buffer.duration });
      await new Promise<void>((accept) => {
        source.onended = () => accept();
        source.start();
      });
    },
    async dump() {
      return await new Promise<string>((accept, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const encoded =
            typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
          if (encoded) accept(encoded);
          else reject(new Error("音声の書き出しに失敗しました"));
        };
        reader.onerror = () => reject(new Error("音声の読込みに失敗しました"));
        reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType }));
      });
    },
    async stop() {
      await new Promise<void>((accept) => {
        recorder.onstop = () => accept();
        recorder.stop();
      });
      return this.dump();
    },
  };
}
