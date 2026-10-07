let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(
  ac: AudioContext,
  start: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
  return g;
}

const FIRE_WAV = `/fire.wav`;
const SAUCER_WAV = `/saucerSmall.wav`;
const BANG_WAV = {
  large: `/bangLarge.wav`,
  medium: `/bangMedium.wav`,
  small: `/bangSmall.wav`,
} as const;

function playWav(src: string) {
  const clip = new Audio(src);
  clip.preload = "auto";
  void clip.play().catch(() => null);
}

/** Turret shot from public/fire.wav. New element each time so rapid fire can overlap. */
export function playTurretShot() {
  playWav(FIRE_WAV);
}

export function playBoulderBang(size: "large" | "medium" | "small") {
  playWav(BANG_WAV[size]);
}

let saucerBuffer: AudioBuffer | null = null;
let saucerSource: AudioBufferSourceNode | null = null;
let saucerGain: GainNode | null = null;
let saucerHtml: HTMLAudioElement | null = null;
let saucerEpoch = 0;
let saucerWanted = false;

function stopSaucerNodes() {
  if (saucerSource) {
    try {
      saucerSource.stop();
    } catch {
      // Already stopped.
    }
    try {
      saucerSource.disconnect();
    } catch {
      // Already disconnected.
    }
    saucerSource = null;
  }
  if (saucerGain) {
    try {
      saucerGain.disconnect();
    } catch {
      // Already disconnected.
    }
    saucerGain = null;
  }
  if (saucerHtml) {
    saucerHtml.pause();
    saucerHtml.loop = false;
    saucerHtml.src = "";
    saucerHtml = null;
  }
}

function pcm8FromWav(ac: AudioContext, data: ArrayBuffer): AudioBuffer {
  const v = new DataView(data);
  let rate = 11025;
  let offset = 12;
  let pcm: Uint8Array | null = null;
  while (offset + 8 <= v.byteLength) {
    const id = String.fromCharCode(
      v.getUint8(offset),
      v.getUint8(offset + 1),
      v.getUint8(offset + 2),
      v.getUint8(offset + 3),
    );
    const size = v.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      rate = v.getUint32(body + 4, true) || 11025;
    } else if (id === "data") {
      pcm = new Uint8Array(data, body, size);
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!pcm || pcm.length < 1) throw new Error("saucer wav has no PCM");
  const buf = ac.createBuffer(1, pcm.length, rate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = (pcm[i] - 128) / 128;
  return buf;
}

async function loadSaucerBuffer(ac: AudioContext): Promise<AudioBuffer> {
  if (saucerBuffer) return saucerBuffer;
  const res = await fetch(SAUCER_WAV);
  if (!res.ok) throw new Error("saucer wav missing");
  const data = await res.arrayBuffer();
  try {
    saucerBuffer = await ac.decodeAudioData(arrCopy(data));
  } catch {
    saucerBuffer = pcm8FromWav(ac, data);
  }
  return saucerBuffer;
}

function arrCopy(data: ArrayBuffer): ArrayBuffer {
  return data.slice(0);
}

function startSaucerHtmlLoop() {
  if (saucerHtml) return;
  const clip = new Audio(SAUCER_WAV);
  clip.loop = true;
  clip.preload = "auto";
  clip.volume = 0.7;
  saucerHtml = clip;
  void clip.play().catch(() => null);
}

async function startSaucerLoop(epoch: number) {
  const ac = audio();
  if (!ac) {
    if (epoch === saucerEpoch && saucerWanted) startSaucerHtmlLoop();
    return;
  }
  try {
    const buf = await loadSaucerBuffer(ac);
    if (epoch !== saucerEpoch || !saucerWanted) return;
    if (saucerSource) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ac.createGain();
    g.gain.value = 0.55;
    src.connect(g);
    g.connect(ac.destination);
    src.start();
    saucerSource = src;
    saucerGain = g;
  } catch {
    if (epoch !== saucerEpoch || !saucerWanted) return;
    startSaucerHtmlLoop();
  }
}

export function startSaucerSiren() {
  saucerWanted = true;
  if (saucerSource || saucerHtml) return;
  const epoch = ++saucerEpoch;
  void startSaucerLoop(epoch);
}

export function stopSaucerSiren() {
  saucerWanted = false;
  saucerEpoch += 1;
  stopSaucerNodes();
}

export function playSaucerPellet() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(240, t + 0.12);
  const g = envGain(ac, t, 0.07, 0.004, 0.1);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.14);
}

export function playShieldHit() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
  const g = envGain(ac, t, 0.08, 0.003, 0.08);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** Crack/boom for exploding orbs (and boulder hits). */
export function playOrbExplode() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;

  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.28);
  const noise = envGain(ac, t, 0.22, 0.004, 0.22);
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 180;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.exponentialRampToValueAtTime(280, t + 0.24);
  src.connect(hp);
  hp.connect(noise);
  noise.connect(lp);
  lp.connect(ac.destination);
  src.start(t);
  src.stop(t + 0.28);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.2);
  const boom = envGain(ac, t, 0.16, 0.006, 0.2);
  osc.connect(boom);
  boom.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.22);
}
