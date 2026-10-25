// 実MediaStreamの音量だけを観測する。音声の録音・保存・文字起こしは行わない。
export function observeVoiceActivity(track: MediaStreamTrack, onActivity: () => void) {
  if (typeof AudioContext === "undefined") return () => undefined;
  let context: AudioContext;
  try {
    context = new AudioContext();
    const source = context.createMediaStreamSource(new MediaStream([track]));
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const energy = Math.sqrt(
        samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
      );
      if (energy > 0.015) onActivity();
    }, 100);
    return () => {
      clearInterval(timer);
      source.disconnect();
      void context.close();
    };
  } catch {
    return () => undefined;
  }
}
