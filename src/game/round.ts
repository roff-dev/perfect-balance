import type { CatalogueEntry, ModelRef } from '../data/catalogue';
import type { Plan } from './generate';

export interface Item {
  id: string;
  name: string;
  /** For the tile until its picture is drawn. */
  color: string;
  /** Real weight, which only counts once the scale is unlocked. */
  kg: number;
  model: ModelRef;
  /** Length, height and width in physics units: the model's unit cube is stretched to this along x, y and z. */
  size: [x: number, y: number, z: number];
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
  const item = ({ id, name, weightKg, model, dimensionsM: { l, w, h } }: CatalogueEntry): Item => ({
    id,
    name,
    color: model.color,
    kg: weightKg,
    model,
    size: [l * k, h * k, w * k],
  });
  return {
    unitsPerMetre: k,
    prompt: item(plan.prompt),
    inventory: plan.inventory.map(item),
    solution: plan.solution.map(({ entry, count }) => ({ itemId: entry.id, count })),
  };
}
