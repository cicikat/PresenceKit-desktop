/** One analysis graph per output element. Attach when the element is created, not at mount. */
export function monitorPlaybackLevel(audio: HTMLMediaElement, report: (volume: number | null) => void): () => void {
  let context: AudioContext | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Float32Array<ArrayBuffer> | null = null;
  let frame: number | null = null;
  let generation = 0;
  let disposed = false;
  let failed = false;

  const stop = () => {
    generation++;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    report(null);
  };
  const start = async () => {
    stop();
    if (disposed || failed) return;
    const token = generation;
    try {
      context ??= new AudioContext();
      // Resume before routing the element into WebAudio, so a rejected resume does not mute it.
      if (context.state === 'suspended') await context.resume();
      if (disposed || token !== generation || audio.paused) return;
      if (!analyser) {
        analyser = context.createAnalyser();
        analyser.fftSize = 512;
        data = new Float32Array(analyser.fftSize);
        source = context.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(context.destination);
      }
      const sample = () => {
        if (disposed || token !== generation || audio.paused || !analyser || !data) return;
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
        report(Math.min(1, rms * 3));
        frame = requestAnimationFrame(sample);
      };
      sample();
    } catch (error) {
      failed = true;
      // Keep audible output connected if analysis failed after creating the source.
      if (source && context) { source.disconnect(); source.connect(context.destination); }
      report(null);
      console.warn('[voice] output analysis unavailable:', error);
    }
  };
  const waiting = () => { stop(); report(0); };
  audio.addEventListener('playing', start);
  for (const event of ['pause', 'ended', 'error', 'emptied']) audio.addEventListener(event, stop);
  audio.addEventListener('waiting', waiting);
  return () => {
    disposed = true;
    stop();
    audio.removeEventListener('playing', start);
    for (const event of ['pause', 'ended', 'error', 'emptied']) audio.removeEventListener(event, stop);
    audio.removeEventListener('waiting', waiting);
    source?.disconnect();
    analyser?.disconnect();
    void context?.close().catch(() => {});
  };
}
