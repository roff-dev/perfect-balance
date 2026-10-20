import { THEME_NAMES, type CatalogueEntry, type Theme } from '../data/catalogue';
import { CONFIG } from './config';
import { DAILY_RULES, generateGame, solve, type Plan, type Rules } from './generate';
import type { Margin } from './judge';
import { hashSeed } from './random';
import { buildRound, type Round } from './round';

export const ROUND_CHOICES = [3, 5, 10] as const;
export const CAP_CHOICES = [5, 8, 12] as const;
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard', expert: 'Expert' };

/** How close counts as balanced, and where the built solution lands inside that. Normal is the daily's. */
const WINDOWS: Record<Difficulty, { margin: Margin; target: Margin }> = {
  easy: { margin: { min: 0.9, max: 1.1 }, target: DAILY_RULES.target },
  normal: { margin: DAILY_RULES.margin, target: DAILY_RULES.target },
  hard: { margin: { min: 0.98, max: 1.02 }, target: { min: 0.985, max: 1.015 } },
  expert: { margin: { min: 0.99, max: 1.01 }, target: { min: 0.9925, max: 1.0075 } },
};

export interface FreeplaySettings {
  rounds: (typeof ROUND_CHOICES)[number];
  /** How close counts as balanced. */
  difficulty: Difficulty;
  /** At most this many things in play at once; 0 for no limit. */
  cap: 0 | (typeof CAP_CHOICES)[number];
  theme: Theme | null;
  /** Match a round weight instead of an object. */
  targetWeight: boolean;
  /** Keep going until a miss. */
  endless: boolean;
}

export const DEFAULT_FREEPLAY: FreeplaySettings = { rounds: 5, difficulty: 'normal', cap: 0, theme: null, targetWeight: false, endless: false };

export function rulesFor(s: FreeplaySettings): Rules {
  return {
    ...DAILY_RULES,
    ...WINDOWS[s.difficulty],
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
    // settings saved before the difficulties had a Precision switch, which is Expert
    difficulty: oneOf(DIFFICULTIES, r.difficulty, r.precision === true ? 'expert' : 'normal'),
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
  if (s.difficulty !== 'normal') q.set('difficulty', s.difficulty);
  if (s.cap) q.set('cap', String(s.cap));
  if (s.theme) q.set('theme', s.theme);
  if (s.targetWeight) q.set('target', '1');
  return `?${q}`;
}

export function fromQuery(q: URLSearchParams): FreeplaySettings {
  return normaliseSettings({
    rounds: Number(q.get('rounds')),
    difficulty: q.get('difficulty'),
    // links made before the difficulties
    precision: q.get('precision') === '1',
    cap: Number(q.get('cap')),
    theme: q.get('theme'),
    targetWeight: q.get('target') === '1',
    endless: q.get('endless') === '1',
  });
}

const percent = (x: number) => `${Math.round(Math.abs(x - 1) * 1000) / 10}%`;

/** The win window in words: "within 2% either way", or "within 3% light or 4% heavy". */
export function windowWords(d: Difficulty): string {
  const { min, max } = WINDOWS[d].margin;
  return percent(min) === percent(max) ? `within ${percent(min)} either way` : `within ${percent(min)} light or ${percent(max)} heavy`;
}

/** The rules in a few words, for under the prompt: "Within 2%, at most 8 things". */
export function describeRules(s: FreeplaySettings): string {
  const parts = [s.difficulty !== 'normal' && windowWords(s.difficulty).replace(' either way', ''), s.cap && `at most ${s.cap} things`, s.theme && THEME_NAMES[s.theme].toLowerCase()].filter(Boolean) as string[];
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
    /** A freeplay game's rules. Without them nothing can be left out of a round: a numbered puzzle is the same for everyone. */
    private readonly rules?: Rules,
  ) {}

  plan(i: number): Plan {
    while (this.plans.length <= i) this.plans.push(...this.more(this.plans.length / CONFIG.roundsPerGame, this.plans.slice(-CONFIG.roundsPerGame)));
    return this.plans[i]!;
  }

  at(i: number): Round {
    return (this.built[i] ??= buildRound(this.plan(i)));
  }

  /** Whether round `i` can still be balanced without these objects, say because their models wouldn't load. */
  playableWithout(i: number, ids: readonly string[]): boolean {
    const plan = this.plan(i);
    if (!this.rules || ids.includes(plan.prompt.id)) return false;
    return !!solve(plan.inventory.filter((e) => !ids.includes(e.id)), plan.prompt.weightKg, this.rules);
  }

  static of(plans: Plan[], rules?: Rules): RoundSupply {
    return new RoundSupply(() => plans, plans.length, rules);
  }

  static freeplay(seed: number, s: FreeplaySettings, catalogue: readonly CatalogueEntry[]): RoundSupply {
    const rules = rulesFor(s);
    if (!s.endless) return RoundSupply.of(generateGame(seed, { catalogue, rules, rounds: s.rounds }), rules);
    // each batch avoids the last one's prompts where it can
    return new RoundSupply(
      (batch, previous) =>
        generateGame(batch ? hashSeed(seed, 'endless', batch) : seed, { catalogue, rules, rounds: CONFIG.roundsPerGame, recent: new Map(previous.map((p) => [p.prompt.id, 1])) }),
      Infinity,
      rules,
    );
  }
}
