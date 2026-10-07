/** Browser localStorage helpers for UI prefs. Not a DARKE ID vault. */

export function readLocalText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalText(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

export const LOCAL_PREFS = "darke.prefs";
