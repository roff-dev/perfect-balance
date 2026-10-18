import type { CatalogueEntry, Theme } from '../data/catalogue';
import { CONFIG } from './config';
import { verdictFor, type Margin } from './judge';
import { hashSeed, int, mulberry32, pick, shuffle, type Rng } from './random';

/**
 * How much of the pan the solution may fill, fixed by the packing test. By volume: its bounding
 * boxes against a cylinder as tall as the pan is wide, so piles stay well clear of the chains.
 * Unsteady things don't stack, so their footprints also have to fit in part of one layer.
 */
export const PACKING = { volume: 0.12, unsteady: 0.3 };
/** Height over narrowest width past which a thing topples when stacked. */
const TOPPLES = 2.5;
/** A few prompts only make a fair round from ~2% of sub-seeds, and a failed try is cheap. Daily prompt history relies on this. */
const ATTEMPTS = 400;
/** Smaller pans need gravity past what scaled physics was proven stable at (65 units/s²). */
const MIN_PAN_METRES = 0.2;
/** Prompts are grouped into ×3 weight bands, and a game takes each of its prompts from a different one. */
const BAND = Math.log(3);
/** Decoys are spread across weights from this far below the prompt to this far above. */
const SPREAD = { below: 300, above: 3 };
/** Brass, for the weights that stand in for a prompt. */
const BRASS_KG_PER_M3 = 8500;

export interface Rules {
  /** The win window, total / prompt. */
  margin: Margin;
  /** Where the built solution lands: just inside the window. */
  target: Margin;
  /** The most objects a solution may use. */
  maxItems: number;
  /** The prompt and solution come from this theme, and decoys lean towards it. */
  theme?: Theme;
  /** Each prompt is swapped for a brass weight of a round number near it. */
  targetWeight?: boolean;
}

export const DAILY_RULES: Rules = { margin: CONFIG.margin, target: { min: 0.975, max: 1.035 }, maxItems: CONFIG.solutionMaxItems };

export interface Plan {
  prompt: CatalogueEntry;
  inventory: CatalogueEntry[];
  solution: { entry: CatalogueEntry; count: number }[];
  /** Real diameter of the pan for this round. */
  panMetres: number;
  /** Roughly how many mixes of up to `maxItems` objects win: a difficulty measure, never shown. */
  solutions: number;
}

export interface GameOptions {
  catalogue: readonly CatalogueEntry[];
  /** Only entries added in this catalogue version or earlier take part. */
  version?: number;
  /** How many puzzles ago each prompt last came up. */
  recent?: ReadonlyMap<string, number>;
  rules?: Rules;
  rounds?: number;
}

/** Diagonal of what the object covers as it stands. */
export const footprint = ({ dimensionsM: { l, w } }: CatalogueEntry) => Math.hypot(l, w);
const area = ({ dimensionsM: { l, w } }: CatalogueEntry) => l * w;
const volume = ({ dimensionsM: { l, w, h } }: CatalogueEntry) => l * w * h;
const thinnest = ({ dimensionsM: { l, w, h } }: CatalogueEntry) => Math.min(l, w, h);
export const weightBand = (kg: number) => Math.floor(Math.log(kg) / BAND);

/**
 * Each prompt from a different weight band, in a random order. Past one per band the bands come
 * round again, and once every prompt has been used they can repeat.
 */
export function generateGame(
  seed: number,
  { catalogue, version = Infinity, recent = new Map(), rules = DAILY_RULES, rounds = CONFIG.roundsPerGame }: GameOptions,
): Plan[] {
  const entries = catalogue.filter((e) => e.addedIn <= version);
  const prompts = rules.theme ? entries.filter((e) => e.themes.includes(rules.theme!)) : entries;
  const order = promptOrder(mulberry32(seed), prompts, recent);
  const plans: Plan[] = [];
  const tried = new Set<string>();
  let repeat = 0;
  let builtThisRepeat = false;
  for (;;) {
    let built = false;
    for (const band of order) {
      for (const prompt of band) {
        if (tried.has(prompt.id)) continue;
        tried.add(prompt.id);
        const plan = generateRound(rules.targetWeight ? brassWeight(prompt) : prompt, entries, repeat ? hashSeed(seed, prompt.id, repeat) : hashSeed(seed, prompt.id), rules);
        if (plan) {
          plans.push(plan);
          built = builtThisRepeat = true;
          break;
        }
      }
      if (plans.length === rounds) return plans;
    }
    if (built) continue;
    if (!builtThisRepeat) throw new Error(`Only ${plans.length} rounds could be built from seed ${seed}.`);
    tried.clear();
    repeat++;
    builtThisRepeat = false;
  }
}

/**
 * The weight bands in a random order, each with its prompts best first. Prompts that came up
 * within the cooldown go to the back, the longest ago first, so a small catalogue still works
 * and repeats stay as far apart as it allows.
 */
export function promptOrder(rng: Rng, entries: readonly CatalogueEntry[], recent: ReadonlyMap<string, number>): CatalogueEntry[][] {
  const bands = new Map<number, CatalogueEntry[]>();
  for (const e of entries) {
    if (!e.canBePrompt) continue;
    const band = weightBand(e.weightKg);
    bands.set(band, [...(bands.get(band) ?? []), e]);
  }
  const age = (e: CatalogueEntry) => recent.get(e.id) ?? Infinity;
  return shuffle(rng, [...bands.keys()].sort((a, b) => a - b)).map((band) => {
    const prompts = shuffle(rng, bands.get(band)!);
    const fresh = prompts.filter((e) => age(e) > CONFIG.promptCooldownPuzzles);
    const stale = prompts.filter((e) => age(e) <= CONFIG.promptCooldownPuzzles).sort((a, b) => age(b) - age(a));
    return [...fresh, ...stale];
  });
}

const ROUND_NUMBERS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5];

/** The nearest weight a market might stock: 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 7.5 times a power of ten. */
export function roundWeight(kg: number): number {
  const power = 10 ** Math.floor(Math.log10(kg));
  const steps = [...ROUND_NUMBERS, 10].map((n) => n * power);
  return +steps.reduce((best, s) => (Math.abs(Math.log(s / kg)) < Math.abs(Math.log(best / kg)) ? s : best)).toPrecision(3);
}

export function formatWeight(kg: number): string {
  if (kg < 1) return `${+(kg * 1000).toPrecision(3)} g`;
  if (kg < 1000) return `${kg} kg`;
  return `${kg / 1000} tonne${kg === 1000 ? '' : 's'}`;
}

/** A brass cylinder as wide as it is tall, of a round weight close to the prompt's. */
export function brassWeight(prompt: CatalogueEntry): CatalogueEntry {
  const kg = roundWeight(prompt.weightKg);
  const d = Math.cbrt((4 * kg) / (BRASS_KG_PER_M3 * Math.PI));
  return {
    ...prompt,
    id: `weight-${kg}`,
    name: `${formatWeight(kg)} weight`,
    weightKg: kg,
    dimensionsM: { l: d, w: d, h: d },
    canBeInventory: false,
    unsteady: false,
    model: { shape: 'cylinder', color: '#b8892f' },
  };
}

/** Tries a few sub-seeds; a prompt that can't be built into a fair round is skipped. */
export function generateRound(prompt: CatalogueEntry, entries: readonly CatalogueEntry[], seed: number, rules = DAILY_RULES): Plan | undefined {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const plan = tryRound(prompt, entries, mulberry32(hashSeed(seed, attempt)), rules);
    if (plan) return plan;
  }
  return undefined;
}

function tryRound(prompt: CatalogueEntry, entries: readonly CatalogueEntry[], rng: Rng, rules: Rules): Plan | undefined {
  const P = prompt.weightKg;
  const { theme } = rules;
  const inTheme = (e: CatalogueEntry) => !theme || e.themes.includes(theme);
  // a single object that already balances would make the round trivial
  const pool = entries.filter(
    (e) => e.canBeInventory && e.id !== prompt.id && verdictFor(e.weightKg / P, rules.margin) !== 'balanced',
  );
  const within = (lo: number, hi: number) => pool.filter((e) => e.weightKg >= P * lo && e.weightKg <= P * hi);
  // the theme's own, or anything when it has none in range
  const themed = (list: CatalogueEntry[]) => (list.some(inTheme) ? list.filter(inTheme) : list);

  // the solution first: one anchor, from the theme if there is one, and one or two fillers
  const anchors = within(1 / 30, 1 / 2).filter(inTheme);
  if (anchors.length === 0) return undefined;
  const anchor = pick(rng, anchors);
  const fillers = shuffle(rng, themed(within(1 / 200, 1 / 20).filter((e) => e !== anchor))).slice(0, rng() < 0.5 ? 1 : 2);
  if (fillers.length === 0) return undefined;
  const types = [anchor, ...fillers];
  const counts = pickCounts(rng, P, types.map((e) => e.weightKg), rules);
  if (!counts) return undefined;
  const solution = types.map((entry, i) => ({ entry, count: counts[i]! }));

  // the pan is sized from what's on show, never from weights
  const sizes = solution.flatMap(({ entry, count }) => Array<number>(count).fill(footprint(entry))).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)]!;
  const D = Math.max(MIN_PAN_METRES, 1.15 * footprint(prompt), 2.2 * median, ...types.map((e) => 1.15 * footprint(e)));
  const fits = (e: CatalogueEntry) => 1.15 * footprint(e) <= D && thinnest(e) >= D / 80;
  if (!fits(prompt) || !types.every(fits)) return undefined;
  if (!packs(solution, D)) return undefined;

  // then the decoys: much heavier, much lighter, and some that look wrong for their weight; in a theme, its own things first
  const candidates = pool.filter((e) => fits(e) && !types.includes(e));
  const rest = theme ? [...shuffle(rng, candidates.filter(inTheme)), ...shuffle(rng, candidates.filter((e) => !inTheme(e)))] : shuffle(rng, candidates);
  const heavy = rest.filter((e) => e.weightKg >= CONFIG.heavyFactor * P);
  const light = rest.filter((e) => e.weightKg <= CONFIG.lightFactor * P);
  if (heavy.length < CONFIG.minHeavyTypes || light.length < CONFIG.minLightTypes) return undefined;
  const chosen = [...types, ...heavy.slice(0, CONFIG.minHeavyTypes), ...light.slice(0, CONFIG.minLightTypes)];
  for (const e of rest) {
    if (chosen.filter((c) => c.sizeContradiction).length >= 2) break;
    if (e.sizeContradiction && !chosen.includes(e)) chosen.push(e);
  }
  if (chosen.filter((c) => c.sizeContradiction).length < 2) return undefined;

  const size = int(rng, CONFIG.inventorySize.min, CONFIG.inventorySize.max);
  const spare = rest.filter((e) => !chosen.includes(e));
  const lo = Math.log(P / SPREAD.below);
  const hi = Math.log(P * SPREAD.above);
  while (chosen.length < size && spare.length > 0) {
    const target = lo + rng() * (hi - lo);
    const from = themed(spare);
    let best = from[0]!;
    for (const e of from) if (Math.abs(Math.log(e.weightKg) - target) < Math.abs(Math.log(best.weightKg) - target)) best = e;
    chosen.push(best);
    spare.splice(spare.indexOf(best), 1);
  }
  if (chosen.length < CONFIG.inventorySize.min) return undefined;

  const inventory = shuffle(rng, chosen);
  if (!solve(inventory, P, rules)) return undefined;
  return { prompt, inventory, solution, panMetres: D, solutions: countSolutions(inventory, P, rules) };
}

/** Rolls off a pile or topples when stacked: balls, animals, and anything much taller than it is wide. */
const unsteady = (e: CatalogueEntry) => !!e.unsteady || e.dimensionsM.h >= TOPPLES * Math.min(e.dimensionsM.l, e.dimensionsM.w);

export function packs(solution: Plan['solution'], panMetres: number): boolean {
  const panArea = (Math.PI * panMetres * panMetres) / 4;
  let boxes = 0;
  let unsteadyArea = 0;
  for (const { entry, count } of solution) {
    boxes += count * volume(entry);
    if (unsteady(entry)) unsteadyArea += count * area(entry);
  }
  return boxes <= PACKING.volume * panArea * panMetres && unsteadyArea <= PACKING.unsteady * panArea;
}

/** Counts of each type, at least one of each, landing inside the target and within the item limit. */
function pickCounts(rng: Rng, P: number, weights: number[], { target, maxItems }: Rules): number[] | undefined {
  const options: number[][] = [];
  const walk = (i: number, counts: number[], kg: number, n: number) => {
    if (i === weights.length) {
      if (kg >= target.min * P) options.push(counts);
      return;
    }
    const w = weights[i]!;
    const last = i === weights.length - 1;
    for (let c = last ? Math.max(1, Math.ceil((target.min * P - kg) / w)) : 1; kg + c * w <= target.max * P && n + c <= maxItems; c++) {
      walk(i + 1, [...counts, c], kg + c * w, n + c);
    }
  };
  walk(0, [], 0, 0);
  return options.length ? pick(rng, options) : undefined;
}

/** Fine enough that 30 rounded weights stay well inside the window's width. */
const RESOLUTION = 4000;

/**
 * The proof a round can be won: the fewest objects for every total, as a bounded DP over all
 * inventory types (any number of each). A total found this way is re-checked with the real weights.
 */
export function solve(inventory: readonly CatalogueEntry[], promptKg: number, { margin, maxItems } = DAILY_RULES): { entry: CatalogueEntry; count: number }[] | undefined {
  const top = Math.floor(margin.max * RESOLUTION);
  const weights = inventory.map((e) => Math.max(1, Math.round((e.weightKg / promptKg) * RESOLUTION)));
  const fewest = new Uint8Array(top + 1).fill(255);
  const via = new Int16Array(top + 1).fill(-1);
  fewest[0] = 0;
  for (let s = 1; s <= top; s++) {
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]!;
      if (w <= s && fewest[s - w]! + 1 < fewest[s]!) {
        fewest[s] = fewest[s - w]! + 1;
        via[s] = i;
      }
    }
  }
  for (let s = Math.ceil(margin.min * RESOLUTION); s <= top; s++) {
    if (fewest[s]! > maxItems) continue;
    const counts = new Map<number, number>();
    for (let t = s; t > 0; t -= weights[via[t]!]!) counts.set(via[t]!, (counts.get(via[t]!) ?? 0) + 1);
    const kg = [...counts].reduce((sum, [i, c]) => sum + inventory[i]!.weightKg * c, 0);
    if (verdictFor(kg / promptKg, margin) === 'balanced') return [...counts].map(([i, count]) => ({ entry: inventory[i]!, count }));
  }
  return undefined;
}

/** Mixes of up to `maxItems` objects that win, counted on a coarse grid. */
export function countSolutions(inventory: readonly CatalogueEntry[], promptKg: number, { margin, maxItems } = DAILY_RULES, resolution = 500): number {
  const top = Math.floor(margin.max * resolution);
  const bottom = Math.ceil(margin.min * resolution);
  const ways = Array.from({ length: maxItems + 1 }, () => new Float64Array(top + 1));
  ways[0]![0] = 1;
  for (const e of inventory) {
    const w = Math.max(1, Math.round((e.weightKg / promptKg) * resolution));
    if (w > top) continue;
    // ascending counts reuse this type's own earlier copies, so any number of each is counted
    for (let c = 1; c <= maxItems; c++) {
      const prev = ways[c - 1]!;
      const cur = ways[c]!;
      for (let s = w; s <= top; s++) cur[s]! += prev[s - w]!;
    }
  }
  let total = 0;
  for (let c = 1; c <= maxItems; c++) for (let s = bottom; s <= top; s++) total += ways[c]![s]!;
  return total;
}
