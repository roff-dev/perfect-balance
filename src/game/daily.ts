import type { CatalogueEntry } from '../data/catalogue';
import { CATALOGUE_VERSIONS, type VersionRange } from '../data/catalogue-versions';
import { CONFIG } from './config';
import { generateGame, promptOrder, type Plan } from './generate';
import { hashSeed, mulberry32 } from './random';

/** Midnight UTC on the day puzzle #1 came out. */
export const EPOCH = Date.UTC(2026, 9, 17);
export const DAY_MS = 86_400_000;

/** Today's puzzle; a new one starts at midnight UTC everywhere. */
export function puzzleNumber(now = Date.now()): number {
  return Math.max(1, Math.floor((now - EPOCH) / DAY_MS) + 1);
}

export function puzzleDate(n: number): Date {
  return new Date(EPOCH + (n - 1) * DAY_MS);
}

export function msUntilNext(now = Date.now()): number {
  return EPOCH + puzzleNumber(now) * DAY_MS - now;
}

/** "05:12:33" */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((v) => String(v).padStart(2, '0')).join(':');
}

export function versionFor(n: number): VersionRange {
  return [...CATALOGUE_VERSIONS].reverse().find((v) => v.from <= n) ?? CATALOGUE_VERSIONS[0]!;
}

const seedFor = (n: number, range: VersionRange) => hashSeed('daily', n, range.generator);

/**
 * The prompts each puzzle led with, worked out from #1 without building whole rounds: every
 * band's first choice, which is the one built unless it can't make a fair round.
 */
const histories = new WeakMap<readonly CatalogueEntry[], string[][]>();

function recentBefore(n: number, catalogue: readonly CatalogueEntry[]): Map<string, number> {
  let history = histories.get(catalogue);
  if (!history) histories.set(catalogue, (history = []));
  while (history.length < n - 1) {
    const p = history.length + 1;
    const range = versionFor(p);
    const entries = catalogue.filter((e) => e.addedIn <= range.catalogue);
    const order = promptOrder(mulberry32(seedFor(p, range)), entries, recentFrom(history, p));
    history.push(order.slice(0, CONFIG.roundsPerGame).map((prompts) => prompts[0]!.id));
  }
  return recentFrom(history, n);
}

/** How many puzzles before `n` each prompt last came up, within the cooldown. */
function recentFrom(history: string[][], n: number): Map<string, number> {
  const recent = new Map<string, number>();
  for (let ago = 1; ago <= CONFIG.promptCooldownPuzzles && n - ago >= 1; ago++) {
    for (const id of history[n - ago - 1]!) if (!recent.has(id)) recent.set(id, ago);
  }
  return recent;
}

/** Puzzle `n`'s five rounds: the same for everyone, and never changed by later catalogue additions. */
export function dailyGame(n: number, catalogue: readonly CatalogueEntry[]): Plan[] {
  const range = versionFor(n);
  return generateGame(seedFor(n, range), { catalogue, version: range.catalogue, recent: recentBefore(n, catalogue) });
}
