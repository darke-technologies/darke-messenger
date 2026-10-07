const CONFIRM_IDENTITY_KEY = "darke.gateAudio.confirmIdentity";
const IDENTITY_CONFIRMED_KEY = "darke.gateAudio.identityConfirmed";

let current: HTMLAudioElement | null = null;
let unlock: (() => void) | null = null;

function readFlag(key: string): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getConfirmIdentityAudio(): boolean {
  return readFlag(CONFIRM_IDENTITY_KEY);
}

export function setConfirmIdentityAudio(on: boolean) {
  writeFlag(CONFIRM_IDENTITY_KEY, on);
}

export function getIdentityConfirmedAudio(): boolean {
  return readFlag(IDENTITY_CONFIRMED_KEY);
}

export function setIdentityConfirmedAudio(on: boolean) {
  writeFlag(IDENTITY_CONFIRMED_KEY, on);
}

function clearUnlock() {
  if (!unlock) return;
  window.removeEventListener("pointerdown", unlock);
  unlock = null;
}

export function stopGateSound() {
  clearUnlock();
  if (!current) return;
  current.pause();
  current.removeAttribute("src");
  current.load();
  current = null;
}

/** Plays a public-folder clip. Survives Gate unmount so success audio can finish. */
export function playGateSound(src: string) {
  stopGateSound();
  const audio = new Audio(src);
  audio.preload = "auto";
  current = audio;

  const tryPlay = () => {
    void audio.play().catch(() => {
      if (current !== audio) return;
      clearUnlock();
      unlock = () => {
        unlock = null;
        if (current !== audio) return;
        void audio.play().catch(() => null);
      };
      window.addEventListener("pointerdown", unlock, { once: true });
    });
  };

  tryPlay();
}

export function playConfirmIdentitySound() {
  if (!getConfirmIdentityAudio()) {
    stopGateSound();
    return;
  }
  playGateSound("/confirmidentity.aac");
}

export function playIdentityConfirmedSound() {
  if (!getIdentityConfirmedAudio()) {
    stopGateSound();
    return;
  }
  playGateSound("/identityconfirmed.aac");
}

export function playAbortedSound() {
  playGateSound("/Aborted.aac");
}

export function playAccessDeniedSound() {
  playGateSound("/accessdenied.aac");
}
