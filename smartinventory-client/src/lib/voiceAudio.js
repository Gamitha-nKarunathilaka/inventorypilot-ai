export const voiceLevel = { current: 0 };

let context;

export function getVoiceContext() {
  const AudioContext =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    throw new Error(
      "මේ browser එකේ audio playback නැහැ."
    );
  }

  if (!context || context.state === "closed") {
    context = new AudioContext();
  }

  return context;
}

export async function enableVoiceSound() {
  const audioContext = getVoiceContext();

  if (audioContext.state !== "running") {
    await audioContext.resume();
  }

  return audioContext;
}

export function playVoiceBuffer(buffer, onEnded) {
  const audioContext = getVoiceContext();

  if (audioContext.state !== "running") {
    throw new Error(
      "හඬ ඇරඹීමට Play voice ඔබන්න."
    );
  }

  const source = audioContext.createBufferSource();
  const analyser = audioContext.createAnalyser();

  analyser.fftSize = 1024;

  source.buffer = buffer;
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  const samples = new Float32Array(analyser.fftSize);

  let frame = 0;
  let stopped = false;

  function finish(notify = true) {
    if (stopped) return;

    stopped = true;
    cancelAnimationFrame(frame);

    source.onended = null;

    try {
      source.stop();
    } catch {
      // Already stopped.
    }

    source.disconnect();
    analyser.disconnect();

    audioContext.removeEventListener(
      "statechange",
      onContextChange
    );

    voiceLevel.current = 0;

    if (notify) {
      onEnded();
    }
  }

  function onContextChange() {
    if (audioContext.state !== "running") {
      finish();
    }
  }

  function measure() {
    if (stopped) return;

    analyser.getFloatTimeDomainData(samples);

    let energy = 0;

    for (const sample of samples) {
      energy += sample * sample;
    }

    const rms = Math.sqrt(energy / samples.length);

    const target = Math.min(
      1,
      Math.max(0, rms - 0.006) * 8
    );

    voiceLevel.current =
      voiceLevel.current * 0.6 + target * 0.4;

    frame = requestAnimationFrame(measure);
  }

  source.onended = () => finish();

  audioContext.addEventListener(
    "statechange",
    onContextChange
  );

  try {
    source.start();
    measure();
  } catch (error) {
    finish(false);
    throw error;
  }

  return () => finish(false);
}