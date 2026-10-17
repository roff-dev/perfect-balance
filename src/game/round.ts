import type { CatalogueEntry } from '../data/catalogue';
import type { Plan } from './generate';
import { hullPoints, scaled } from './shapes';

export interface Item {
  id: string;
  name: string;
  color: string;
  /** Real weight, which only counts once the scale is unlocked. */
  kg: number;
  /** Hull points in physics units. */
  points: Float32Array;
}

export interface Round {
  /** Physics units per real metre: the pan is always 1 unit across. */
  unitsPerMetre: number;
  prompt: Item;
  inventory: Item[];
  /** One way to balance it, kept for checking; never shown. */
  solution: { itemId: string; count: number }[];
}

/** Turns a generated plan into objects at the round's physics scale. */
export function buildRound(plan: Plan): Round {
  const k = 1 / plan.panMetres;
  const item = (e: CatalogueEntry): Item => ({
    id: e.id,
    name: e.name,
    color: e.color,
    kg: e.weightKg,
    points: scaled(hullPoints(e.shape, e.dimensionsM), k),
  });
  return {
    unitsPerMetre: k,
    prompt: item(plan.prompt),
    inventory: plan.inventory.map(item),
    solution: plan.solution.map(({ entry, count }) => ({ itemId: entry.id, count })),
  };
}
