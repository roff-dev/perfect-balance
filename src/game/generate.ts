import { CATALOGUE, type CatalogueEntry } from '../data/catalogue';
import { CONFIG } from './config';
import { verdictFor } from './judge';
import { hashSeed, int, mulberry32, pick, shuffle, type Rng } from './random';
import { ROUNDED } from './shapes';

/** Bumped only alongside a new catalogue version range, so past puzzles keep their rounds. */
export const GENERATOR_VERSION = 1;
/**
 * How much of the pan the solution may fill, fixed by the packing test. By volume: its bounding
 * boxes against a cylinder as tall as the pan is wide, so piles stay well clear of the chains.
 * Unsteady things don't stack, so their footprints also have to fit in part of one layer.
 */
export const PACKING = { volume: 0.12, unsteady: 0.3 };
/** Height over narrowest width past which a thing topples when stacked. */
const TOPPLES = 2.5;
const ATTEMPTS = 50;
/** Smaller pans need gravity past what scaled physics was proven stable at (65 units/s²). */
const MIN_PAN_METRES = 0.2;
/** Prompts are grouped into ×3 weight bands, and a game takes each of its prompts from a different one. */
const BAND = Math.log(3);
/** The built solution lands just inside the win window. */
const TARGET = { min: 0.975, max: 1.035 };
/** Decoys are spread across weights from this far below the prompt to this far above. */
const SPREAD = { below: 300, above: 3 };

export interface Plan {
  prompt: CatalogueEntry;
  inventory: CatalogueEntry[];
  solution: { entry: CatalogueEntry; count: number }[];
  /** Real diameter of the pan for this round. */
  panMetres: number;
  /** Roughly how many mixes of up to `solutionMaxItems` objects win: a difficulty measure, never shown. */
  solutions: number;
}

export interface GameOptions {
  catalogue?: readonly CatalogueEntry[];
  /** Only entries added in this catalogue version or earlier take part. */
  version?: number;
  /** Prompts used too recently to come up again. */
  exclude?: ReadonlySet<string>;
}

/** Diagonal of what the object covers as it stands. */
export const footprint = ({ dimensionsM: { l, w } }: CatalogueEntry) => Math.hypot(l, w);
const area = ({ dimensionsM: { l, w } }: CatalogueEntry) => l * w;
const volume = ({ dimensionsM: { l, w, h } }: CatalogueEntry) => l * w * h;
const thinnest = ({ dimensionsM: { l, w, h } }: CatalogueEntry) => Math.min(l, w, h);
export const weightBand = (kg: number) => Math.floor(Math.log(kg) / BAND);

/** Five rounds, each prompt from a different weight band, in a random order. */
export function generateGame(seed: number, { catalogue = CATALOGUE, version = Infinity, exclude = new Set() }: GameOptions = {}): Plan[] {
  const entries = catalogue.filter((e) => e.addedIn <= version);
  const rng = mulberry32(seed);
  const bands = new Map<number, CatalogueEntry[]>();
  for (const e of entries) {
    if (!e.canBePrompt || exclude.has(e.id)) continue;
    const band = weightBand(e.weightKg);
    bands.set(band, [...(bands.get(band) ?? []), e]);
  }
  const plans: Plan[] = [];
  for (const band of shuffle(rng, [...bands.keys()].sort((a, b) => a - b))) {
    for (const prompt of shuffle(rng, bands.get(band)!)) {
      const plan = generateRound(prompt, entries, hashSeed(seed, prompt.id));
      if (plan) {
        plans.push(plan);
        break;
      }
    }
    if (plans.length === CONFIG.roundsPerGame) return plans;
  }
  throw new Error(`Only ${plans.length} rounds could be built from seed ${seed}.`);
}

/** Tries a few sub-seeds; a prompt that can't be built into a fair round is skipped. */
export function generateRound(prompt: CatalogueEntry, entries: readonly CatalogueEntry[], seed: number): Plan | undefined {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const plan = tryRound(prompt, entries, mulberry32(hashSeed(seed, attempt)));
    if (plan) return plan;
  }
  return undefined;
}

function tryRound(prompt: CatalogueEntry, entries: readonly CatalogueEntry[], rng: Rng): Plan | undefined {
  const P = prompt.weightKg;
  // a single object that already balances would make the round trivial
  const pool = entries.filter(
    (e) => e.canBeInventory && e.id !== prompt.id && verdictFor(e.weightKg / P) !== 'balanced',
  );
  const within = (lo: number, hi: number) => pool.filter((e) => e.weightKg >= P * lo && e.weightKg <= P * hi);

  // the solution first: one anchor and one or two fillers
  const anchors = within(1 / 30, 1 / 2);
  if (anchors.length === 0) return undefined;
  const anchor = pick(rng, anchors);
  const fillers = shuffle(rng, within(1 / 200, 1 / 20).filter((e) => e !== anchor)).slice(0, rng() < 0.5 ? 1 : 2);
  if (fillers.length === 0) return undefined;
  const types = [anchor, ...fillers];
  const counts = pickCounts(rng, P, types.map((e) => e.weightKg));
  if (!counts) return undefined;
  const solution = types.map((entry, i) => ({ entry, count: counts[i]! }));

  // the pan is sized from what's on show, never from weights
  const sizes = solution.flatMap(({ entry, count }) => Array<number>(count).fill(footprint(entry))).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)]!;
  const D = Math.max(MIN_PAN_METRES, 1.15 * footprint(prompt), 2.2 * median, ...types.map((e) => 1.15 * footprint(e)));
  const fits = (e: CatalogueEntry) => 1.15 * footprint(e) <= D && thinnest(e) >= D / 80;
  if (!fits(prompt) || !types.every(fits)) return undefined;
  if (!packs(solution, D)) return undefined;

  // then the decoys: much heavier, much lighter, and some that look wrong for their weight
  const rest = shuffle(rng, pool.filter((e) => fits(e) && !types.includes(e)));
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
    let best = 0;
    for (let i = 1; i < spare.length; i++) {
      if (Math.abs(Math.log(spare[i]!.weightKg) - target) < Math.abs(Math.log(spare[best]!.weightKg) - target)) best = i;
    }
    chosen.push(spare.splice(best, 1)[0]!);
  }
  if (chosen.length < CONFIG.inventorySize.min) return undefined;

  const inventory = shuffle(rng, chosen);
  if (!solve(inventory, P)) return undefined;
  return { prompt, inventory, solution, panMetres: D, solutions: countSolutions(inventory, P) };
}

/** Rolls off a pile or topples when stacked: balls, animals, and anything much taller than it is wide. */
const unsteady = (e: CatalogueEntry) => ROUNDED.has(e.shape) || e.dimensionsM.h >= TOPPLES * Math.min(e.dimensionsM.l, e.dimensionsM.w);

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
function pickCounts(rng: Rng, P: number, weights: number[]): number[] | undefined {
  const options: number[][] = [];
  const walk = (i: number, counts: number[], kg: number, n: number) => {
    if (i === weights.length) {
      if (kg >= TARGET.min * P) options.push(counts);
      return;
    }
    const w = weights[i]!;
    const last = i === weights.length - 1;
    for (let c = last ? Math.max(1, Math.ceil((TARGET.min * P - kg) / w)) : 1; kg + c * w <= TARGET.max * P && n + c <= CONFIG.solutionMaxItems; c++) {
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
export function solve(inventory: readonly CatalogueEntry[], promptKg: number): { entry: CatalogueEntry; count: number }[] | undefined {
  const top = Math.floor(CONFIG.margin.max * RESOLUTION);
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
  for (let s = Math.ceil(CONFIG.margin.min * RESOLUTION); s <= top; s++) {
    if (fewest[s]! > CONFIG.solutionMaxItems) continue;
    const counts = new Map<number, number>();
    for (let t = s; t > 0; t -= weights[via[t]!]!) counts.set(via[t]!, (counts.get(via[t]!) ?? 0) + 1);
    const kg = [...counts].reduce((sum, [i, c]) => sum + inventory[i]!.weightKg * c, 0);
    if (verdictFor(kg / promptKg) === 'balanced') return [...counts].map(([i, count]) => ({ entry: inventory[i]!, count }));
  }
  return undefined;
}

/** Mixes of up to `solutionMaxItems` objects that win, counted on a coarse grid. */
export function countSolutions(inventory: readonly CatalogueEntry[], promptKg: number, resolution = 500): number {
  const top = Math.floor(CONFIG.margin.max * resolution);
  const bottom = Math.ceil(CONFIG.margin.min * resolution);
  const max = CONFIG.solutionMaxItems;
  const ways = Array.from({ length: max + 1 }, () => new Float64Array(top + 1));
  ways[0]![0] = 1;
  for (const e of inventory) {
    const w = Math.max(1, Math.round((e.weightKg / promptKg) * resolution));
    if (w > top) continue;
    // ascending counts reuse this type's own earlier copies, so any number of each is counted
    for (let c = 1; c <= max; c++) {
      const prev = ways[c - 1]!;
      const cur = ways[c]!;
      for (let s = w; s <= top; s++) cur[s]! += prev[s - w]!;
    }
  }
  let total = 0;
  for (let c = 1; c <= max; c++) for (let s = bottom; s <= top; s++) total += ways[c]![s]!;
  return total;
}
