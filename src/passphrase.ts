export const PASSPHRASE_MIN = 6;
export const PASSPHRASE_PLACEHOLDER = "Password (6 characters min.)";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{}?~";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;
const GEN_LEN = 32;

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick(alphabet: string): string {
  return alphabet[randomIndex(alphabet.length)] ?? alphabet[0] ?? "x";
}

function shuffle(chars: string[]): void {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    const a = chars[i];
    const b = chars[j];
    if (a === undefined || b === undefined) continue;
    chars[i] = b;
    chars[j] = a;
  }
}

/** 32-character mixed passphrase from a CSPRNG. */
export function generatePassphrase(): string {
  const chars: string[] = [
    pick(LOWER),
    pick(LOWER),
    pick(UPPER),
    pick(UPPER),
    pick(DIGITS),
    pick(DIGITS),
    pick(SYMBOLS),
    pick(SYMBOLS),
  ];
  while (chars.length < GEN_LEN) chars.push(pick(ALL));
  shuffle(chars);
  return chars.join("");
}

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type PassphraseStrength = {
  level: StrengthLevel;
  label: string;
};

export type PassphraseRating = "WEAK" | "SOLID" | "BUNKER-GRADE";

export type PassphraseEstimate = {
  bits: number;
  wordCount: number;
  charLen: number;
  randomChars: boolean;
  rating: PassphraseRating;
  crackTime: string;
};

const BITS_PER_DICEWARE = 12.9;
const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "0123456789",
  "0987654321",
];
const COMMON = [
  "123456",
  "1q2w3e4r",
  "abc123",
  "access",
  "admin",
  "admin123",
  "and",
  "andrea",
  "andrew",
  "apple",
  "are",
  "banana",
  "baseball",
  "batman",
  "battery",
  "buster",
  "but",
  "changeme",
  "charlie",
  "computer",
  "cookie",
  "correct",
  "daniel",
  "darke",
  "dragon",
  "football",
  "for",
  "from",
  "ginger",
  "give",
  "gonna",
  "good",
  "guest",
  "guitar",
  "hammer",
  "harley",
  "have",
  "hello",
  "hello123",
  "hockey",
  "home",
  "horse",
  "hunter",
  "iloveyou",
  "jesus",
  "jordan",
  "just",
  "killer",
  "know",
  "letmein",
  "letmein1",
  "life",
  "like",
  "login",
  "love",
  "maggie",
  "master",
  "michael",
  "monkey",
  "mustang",
  "name",
  "need",
  "never",
  "ninja",
  "not",
  "orange",
  "pass",
  "pass123",
  "passw0rd",
  "password",
  "password1",
  "pepper",
  "princess",
  "qwerty",
  "qwerty1",
  "qwerty123",
  "qwertyuiop",
  "ranger",
  "robert",
  "root",
  "secret",
  "shadow",
  "silver",
  "soccer",
  "staple",
  "summer",
  "sunshine",
  "test",
  "that",
  "the",
  "this",
  "thomas",
  "tigger",
  "time",
  "trustno1",
  "up",
  "user",
  "want",
  "welcome",
  "welcome1",
  "whatever",
  "with",
  "work",
  "you",
  "your",
  "zaq12wsx",
];
const COMMON_SET = new Set(COMMON);

function emptyEstimate(): PassphraseEstimate {
  return {
    bits: 0,
    wordCount: 0,
    charLen: 0,
    randomChars: false,
    rating: "WEAK",
    crackTime: "< 7 DAYS | HIGH RISK",
  };
}

function crackTime(rating: PassphraseRating): string {
  if (rating === "BUNKER-GRADE") return "> 1,000 YEARS | STATE-LEVEL PROOF";
  if (rating === "SOLID") return "3–10 YEARS | TARGETED PROBE RESISTANT";
  return "< 7 DAYS | HIGH RISK";
}

function parseWords(raw: string): string[] {
  const out: string[] = [];
  let buf = "";
  let prevLower = false;
  const flush = () => {
    if (buf.length >= 3) out.push(buf);
    buf = "";
  };
  for (const ch of raw) {
    if (/[A-Za-z]/.test(ch)) {
      if (ch === ch.toUpperCase() && ch !== ch.toLowerCase() && prevLower) flush();
      buf += ch.toLowerCase();
      prevLower = ch === ch.toLowerCase();
      continue;
    }
    prevLower = false;
    flush();
  }
  flush();
  return out.flatMap((w) => splitConcat(w) ?? [w]);
}

function splitConcat(token: string): string[] | null {
  if (token.length < 8) return null;
  const found: string[] = [];
  let i = 0;
  while (i < token.length) {
    let hit = 0;
    for (let n = Math.min(12, token.length - i); n >= 3; n--) {
      if (COMMON_SET.has(token.slice(i, i + n))) {
        hit = n;
        break;
      }
    }
    if (!hit) return null;
    found.push(token.slice(i, i + hit));
    i += hit;
  }
  return found.length >= 2 ? found : null;
}

function engineA(words: string[]): number {
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => {
    if (COMMON_SET.has(w)) return sum + Math.max(4, Math.log2(COMMON.length));
    if (w.length >= 4) return sum + BITS_PER_DICEWARE;
    return sum + 6;
  }, 0);
}

function charsetClasses(raw: string): number {
  let n = 0;
  if (/[a-z]/.test(raw)) n += 1;
  if (/[A-Z]/.test(raw)) n += 1;
  if (/\d/.test(raw)) n += 1;
  if (/[^A-Za-z0-9]/.test(raw)) n += 1;
  return n;
}

function engineB(raw: string): number {
  let pool = 0;
  if (/[a-z]/.test(raw)) pool += 26;
  if (/[A-Z]/.test(raw)) pool += 26;
  if (/\d/.test(raw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(raw)) pool += 33;
  if (pool < 2) pool = 10;
  const len = [...raw].length;
  const unique = new Set([...raw]).size;
  const repeatFactor = Math.min(1, Math.max(0.35, unique / Math.max(1, len)));
  return len * Math.log2(pool) * repeatFactor;
}

function deleet(s: string): string {
  return s.replace(/./g, (c) => {
    if (c === "0") return "o";
    if (c === "1" || c === "!") return "i";
    if (c === "3") return "e";
    if (c === "4" || c === "@") return "a";
    if (c === "5" || c === "$") return "s";
    if (c === "7") return "t";
    return c;
  });
}

function hasRun(hay: string, seq: string, min: number): boolean {
  if (hay.length < min || seq.length < min) return false;
  for (let i = 0; i <= seq.length - min; i++) {
    if (hay.includes(seq.slice(i, i + min))) return true;
  }
  return false;
}

function patternPenalty(raw: string, words: string[]): number {
  let cut = 0;
  const lower = raw.toLowerCase();
  const unleet = deleet(lower);
  for (const seq of SEQUENCES) {
    const rev = [...seq].reverse().join("");
    if (hasRun(lower, seq, 4) || hasRun(lower, rev, 4)) cut += 12;
  }
  if (words.some((w) => COMMON_SET.has(w))) cut += 8;
  if (COMMON.some((w) => w.length >= 4 && unleet.includes(w))) cut += 10;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 4 && (digits.startsWith("19") || digits.startsWith("20"))) {
    cut += 6;
  }
  return cut;
}

function rate(
  bits: number,
  wordCount: number,
  charLen: number,
  randomChars: boolean,
): PassphraseRating {
  if (wordCount >= 6 || (randomChars && charLen >= 16) || bits >= 80) {
    return "BUNKER-GRADE";
  }
  if (bits >= 50 || (wordCount >= 4 && wordCount <= 5)) return "SOLID";
  return "WEAK";
}

/** Dual-engine estimate. Local only — no network. */
export function estimatePassphraseLocal(raw: string): PassphraseEstimate {
  if (!raw) return emptyEstimate();
  const words = parseWords(raw);
  const wordCount = words.length;
  const charLen = [...raw].length;
  const wordBits = engineA(words);
  const charBits = engineB(raw);
  const wordish = wordCount >= 3;
  let bits = wordish ? Math.min(wordBits, charBits + 8) : charBits;
  bits = Math.max(0, bits - patternPenalty(raw, words));
  const randomChars = !wordish && charsetClasses(raw) >= 3 && charLen >= 12;
  const rating = rate(bits, wordCount, charLen, randomChars);
  return {
    bits,
    wordCount,
    charLen,
    randomChars,
    rating,
    crackTime: crackTime(rating),
  };
}

export function passphraseStrength(value: string): PassphraseStrength {
  if (!value) return { level: 0, label: "" };
  if (value.length < PASSPHRASE_MIN) {
    return { level: 0, label: "Too short" };
  }
  const est = estimatePassphraseLocal(value);
  if (est.rating === "BUNKER-GRADE") return { level: 4, label: "Bunker-grade" };
  if (est.rating === "SOLID") return { level: 3, label: "Solid" };
  return { level: 1, label: "Weak" };
}

/** Local estimate. */
export async function estimatePassphrase(raw: string): Promise<PassphraseEstimate> {
  return estimatePassphraseLocal(raw);
}
