/**
 * On-device speech-to-text. Captured PCM never leaves the browser.
 * Inference is in-browser Whisper (WASM), not a cloud ASR API.
 */

const TARGET_RATE = 16_000;

type AsrFn = (
  audio: Float32Array,
  opts: { sampling_rate: number; language: string },
) => Promise<{ text?: string }>;

let asr: AsrFn | null = null;
let asrLoading: Promise<AsrFn> | null = null;

function wipeFloat32(buf: Float32Array | null): null {
  if (buf) buf.fill(0);
  return null;
}

function downsample(
  input: Float32Array,
  inRate: number,
  outRate: number,
): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    const span = Math.max(1, end - start);
    for (let j = start; j < end; j += 1) sum += input[j];
    out[i] = sum / span;
  }
  input.fill(0);
  return out;
}

async function loadLocalWhisper(): Promise<AsrFn> {
  if (asr) return asr;
  if (asrLoading) return asrLoading;
  asrLoading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const pipe = await pipeline(
      "automatic-speech-recognition",
      "Xenova/whisper-tiny.en",
      { dtype: "q8" },
    );
    asr = (audio, opts) =>
      pipe(audio, opts) as Promise<{ text?: string }>;
    return asr;
  })();
  try {
    return await asrLoading;
  } finally {
    asrLoading = null;
  }
}

export type VoiceCapture = {
  stop: () => Promise<string>;
  cancel: () => void;
};

export async function startLocalVoiceCapture(): Promise<VoiceCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
    video: false,
  });
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "";
  const recorder = mime
    ? new MediaRecorder(stream, { mimeType: mime })
    : new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) parts.push(event.data);
  };
  recorder.start(250);

  function releaseHardware(): void {
    if (recorder.state !== "inactive") recorder.stop();
    for (const track of stream.getTracks()) track.stop();
  }

  function dumpParts(): void {
    parts.length = 0;
  }

  return {
    cancel() {
      releaseHardware();
      dumpParts();
    },
    async stop() {
      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(parts, { type: recorder.mimeType }));
        releaseHardware();
      });
      dumpParts();
      if (blob.size < 64) return "";
      const buffer = await blob.arrayBuffer();
      const context = new AudioContext();
      let decoded: AudioBuffer | null = await context.decodeAudioData(buffer.slice(0));
      const raw = decoded.getChannelData(0);
      const copy = new Float32Array(raw.length);
      copy.set(raw);
      raw.fill(0);
      let pcm: Float32Array | null = downsample(
        copy,
        decoded.sampleRate,
        TARGET_RATE,
      );
      decoded = null;
      await context.close();
      try {
        const model = await loadLocalWhisper();
        const result = await model(pcm, {
          sampling_rate: TARGET_RATE,
          language: "english",
        });
        return (result?.text ?? "").trim();
      } finally {
        pcm = wipeFloat32(pcm);
      }
    },
  };
}
