import { CONFIG } from './config';
import { DEFAULT_FREEPLAY, normaliseSettings, type FreeplaySettings } from './freeplay';

export interface RoundResult {
  ratio: number;
  win: boolean;
}

export interface Played {
  rounds: RoundResult[];
  done: boolean;
}

export interface Streak {
  /** Daily puzzles finished one after another, ending at `lastN`. */
  current: number;
  best: number;
  lastN: number;
}

export interface Progress {
  schema: 1;
  daily: Record<number, Played>;
  archive: Record<number, Played>;
  streak: Streak;
  settings: {
    freeplay: FreeplaySettings;
    /** The cookie notice was eaten, so it doesn't come back. */
    cookieEaten: boolean;
  };
}

export type Mode = 'daily' | 'archive';

/** Just the parts of `localStorage` used here, so tests can stand in for it. */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'pb:v1';

export const emptyProgress = (): Progress => ({ schema: 1, daily: {}, archive: {}, streak: { current: 0, best: 0, lastN: 0 }, settings: { freeplay: { ...DEFAULT_FREEPLAY }, cookieEaten: false } });

/** Reading `localStorage` itself throws when the browser blocks storage. */
function browserStore(): Store | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/** Anything missing, unreadable or from another schema gives empty progress, never an error. */
export function load(store = browserStore()): Progress {
  try {
    return normalise(JSON.parse(store?.getItem(KEY) ?? 'null')) ?? emptyProgress();
  } catch {
    return emptyProgress();
  }
}

/** False when the browser won't keep it: private browsing, storage turned off, or full. */
export function save(progress: Progress, store = browserStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function played(raw: unknown): Played | undefined {
  if (!isObject(raw) || !Array.isArray(raw.rounds) || raw.rounds.length > CONFIG.roundsPerGame) return undefined;
  const rounds: RoundResult[] = [];
  for (const r of raw.rounds as unknown[]) {
    if (!isObject(r) || typeof r.ratio !== 'number' || !(r.ratio >= 0) || !Number.isFinite(r.ratio) || typeof r.win !== 'boolean') return undefined;
    rounds.push({ ratio: r.ratio, win: r.win });
  }
  return { rounds, done: rounds.length === CONFIG.roundsPerGame };
}

function puzzles(raw: unknown): Record<number, Played> {
  const out: Record<number, Played> = {};
  if (!isObject(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(key);
    const p = played(value);
    if (Number.isInteger(n) && n >= 1 && p) out[n] = p;
  }
  return out;
}

/** Checks a saved or restored object field by field, filling in what's missing. */
export function normalise(raw: unknown): Progress | undefined {
  if (!isObject(raw) || raw.schema !== 1) return undefined;
  const s = isObject(raw.streak) ? raw.streak : {};
  const streak = isCount(s.current) && isCount(s.best) && isCount(s.lastN) ? { current: s.current, best: Math.max(s.best, s.current), lastN: s.lastN } : emptyProgress().streak;
  const settings = isObject(raw.settings) ? raw.settings : {};
  return { schema: 1, daily: puzzles(raw.daily), archive: puzzles(raw.archive), streak, settings: { freeplay: normaliseSettings(settings.freeplay), cookieEaten: settings.cookieEaten === true } };
}

/** Saves a puzzle's finished rounds; finishing a daily extends the streak. */
export function record(progress: Progress, mode: Mode, n: number, rounds: RoundResult[]): void {
  const done = rounds.length === CONFIG.roundsPerGame;
  const wasDone = progress[mode][n]?.done ?? false;
  progress[mode][n] = { rounds: [...rounds], done };
  if (mode !== 'daily' || !done || wasDone) return;
  const { streak } = progress;
  if (streak.lastN === n) return;
  streak.current = streak.lastN === n - 1 ? streak.current + 1 : 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastN = n;
}

/** A streak survives until a whole puzzle day goes by unplayed. */
export const currentStreak = ({ current, lastN }: Streak, today: number) => (lastN >= today - 1 ? current : 0);

/** Had a streak, and has since missed a day. */
export const lapsed = ({ current, lastN }: Streak, today: number) => current > 0 && lastN < today - 1;

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromBase64Url(code: string): Uint8Array {
  const binary = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

/** All progress as one line of text that can be pasted into another browser. Compressed, as a year of results is long. */
export async function backupCode(progress: Progress): Promise<string> {
  const bytes = await pipe(new TextEncoder().encode(JSON.stringify(progress)), new CompressionStream('deflate-raw'));
  let code = '';
  // in slices, so a long backup doesn't overflow the argument list
  for (let i = 0; i < bytes.length; i += 3 * 4096) code += toBase64Url(bytes.subarray(i, i + 3 * 4096));
  return code;
}

/** The progress in a backup code, or undefined if it isn't one. */
export async function restoreCode(code: string): Promise<Progress | undefined> {
  try {
    const bytes = await pipe(fromBase64Url(code.replace(/\s+/g, '')), new DecompressionStream('deflate-raw'));
    return normalise(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return undefined;
  }
}
