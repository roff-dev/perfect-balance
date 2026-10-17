import { THEME_NAMES, type Theme } from '../data/catalogue';
import { CONFIG } from './config';
import { DAILY_RULES, generateGame, type Plan, type Rules } from './generate';
import { hashSeed } from './random';
import { buildRound, type Round } from './round';

export const ROUND_CHOICES = [3, 5, 10] as const;
export const CAP_CHOICES = [5, 8, 12] as const;

export interface FreeplaySettings {
  rounds: (typeof ROUND_CHOICES)[number];
  /** Win only within 1%. */
  precision: boolean;
  /** At most this many things in play at once; 0 for no limit. */
  cap: 0 | (typeof CAP_CHOICES)[number];
  theme: Theme | null;
  /** Match a round weight instead of an object. */
  targetWeight: boolean;
  /** Keep going until a miss. */
  endless: boolean;
}

export const DEFAULT_FREEPLAY: FreeplaySettings = { rounds: 5, precision: false, cap: 0, theme: null, targetWeight: false, endless: false };

const PRECISE = { margin: { min: 0.99, max: 1.01 }, target: { min: 0.9925, max: 1.0075 } };

export function rulesFor(s: FreeplaySettings): Rules {
  return {
    ...DAILY_RULES,
    ...(s.precision && PRECISE),
    maxItems: s.cap || CONFIG.solutionMaxItems,
    ...(s.theme && { theme: s.theme }),
    ...(s.targetWeight && { targetWeight: true }),
  };
}

const isTheme = (v: unknown): v is Theme => typeof v === 'string' && v in THEME_NAMES;
const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/** Whatever was saved or linked, made into valid settings. */
export function normaliseSettings(raw: unknown): FreeplaySettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    rounds: oneOf(ROUND_CHOICES, r.rounds, DEFAULT_FREEPLAY.rounds),
    precision: r.precision === true,
    cap: oneOf([0, ...CAP_CHOICES] as const, r.cap, 0),
    theme: isTheme(r.theme) ? r.theme : null,
    targetWeight: r.targetWeight === true,
    endless: r.endless === true,
  };
}

/** `?seed=…` plus any rules that differ from the defaults, so a link replays the same game. */
export function toQuery(seed: number, s: FreeplaySettings): string {
  const q = new URLSearchParams({ seed: String(seed) });
  if (s.endless) q.set('endless', '1');
  else if (s.rounds !== DEFAULT_FREEPLAY.rounds) q.set('rounds', String(s.rounds));
  if (s.precision) q.set('precision', '1');
  if (s.cap) q.set('cap', String(s.cap));
  if (s.theme) q.set('theme', s.theme);
  if (s.targetWeight) q.set('target', '1');
  return `?${q}`;
}

export function fromQuery(q: URLSearchParams): FreeplaySettings {
  return normaliseSettings({
    rounds: Number(q.get('rounds')),
    precision: q.get('precision') === '1',
    cap: Number(q.get('cap')),
    theme: q.get('theme'),
    targetWeight: q.get('target') === '1',
    endless: q.get('endless') === '1',
  });
}

/** The rules in a few words, for under the prompt: "Within 1%, at most 8 things". */
export function describeRules(s: FreeplaySettings): string {
  const parts = [s.precision && 'within 1%', s.cap && `at most ${s.cap} things`, s.theme && THEME_NAMES[s.theme].toLowerCase()].filter(Boolean) as string[];
  const text = parts.join(', ');
  return text && text[0]!.toUpperCase() + text.slice(1);
}

/** A game's rounds, built as they're needed. An endless game draws a fresh five whenever it runs out. */
export class RoundSupply {
  private readonly plans: Plan[] = [];
  private readonly built: Round[] = [];

  constructor(
    private readonly more: (batch: number, previous: Plan[]) => Plan[],
    /** Infinity for endless. */
    readonly count: number,
  ) {}

  plan(i: number): Plan {
    while (this.plans.length <= i) this.plans.push(...this.more(this.plans.length / CONFIG.roundsPerGame, this.plans.slice(-CONFIG.roundsPerGame)));
    return this.plans[i]!;
  }

  at(i: number): Round {
    return (this.built[i] ??= buildRound(this.plan(i)));
  }

  static of(plans: Plan[]): RoundSupply {
    return new RoundSupply(() => plans, plans.length);
  }

  static freeplay(seed: number, s: FreeplaySettings): RoundSupply {
    const rules = rulesFor(s);
    if (!s.endless) return RoundSupply.of(generateGame(seed, { rules, rounds: s.rounds }));
    // each batch avoids the last one's prompts where it can
    return new RoundSupply(
      (batch, previous) =>
        generateGame(batch ? hashSeed(seed, 'endless', batch) : seed, { rules, rounds: CONFIG.roundsPerGame, recent: new Map(previous.map((p) => [p.prompt.id, 1])) }),
      Infinity,
    );
  }
}
