import type { Dimensions, ShapeKind } from '../game/shapes';

export type SizeContradiction = 'large-light' | 'small-heavy';

export type Theme = 'food' | 'home' | 'yard' | 'sport' | 'animals';

export const THEME_NAMES: Record<Theme, string> = {
  food: 'Food and drink',
  home: 'Around the house',
  yard: 'Yard and garage',
  sport: 'Sport',
  animals: 'Animals',
};

/** A built model file (scaled to the entry's size), or a simple shape in one palette colour. */
export type ModelRef =
  | {
      file: string;
      collider: 'hull' | 'compound';
      /** Key into credits.json. */
      credit: string;
      /** Its main colour, for the tile until its picture is drawn. */
      color: string;
    }
  | { shape: ShapeKind; color: string };

export interface Source {
  url: string;
  title: string;
  type: string;
  tier: 1 | 2 | 3 | 4;
  accessed: string;
  /** Copied word for word, so the weight can be checked again. */
  quote: string;
}

/** What the game needs of an entry. */
export interface CatalogueEntry {
  id: string;
  /** Descriptive enough to picture: "Bag of cement", not "Cement". */
  name: string;
  /** Exactly what was weighed: a model, breed, rule or pack size. */
  variant: string;
  weightKg: number;
  dimensionsM: Dimensions;
  canBePrompt: boolean;
  canBeInventory: boolean;
  sizeContradiction?: SizeContradiction;
  /** Rolls or topples rather than stacks: balls, animals, people. */
  unsteady?: boolean;
  model: ModelRef;
  themes: Theme[];
  /** Catalogue version the entry first appeared in; older puzzles never see newer entries. */
  addedIn: number;
}

/** An entry as kept in catalogue.json, with the research behind its weight. */
export interface SourcedEntry extends CatalogueEntry {
  variance?: { minKg: number; maxKg: number; basis: string };
  source: Source;
  secondary: { url: string; title: string; valueKg: number; quote: string }[];
  /** The arithmetic, when the weight is worked out from sourced parts (contents × density + container). */
  derived?: string;
  /** Only high-confidence weights can be prompts. */
  confidence: 'high' | 'medium' | 'low';
  category: string;
  tags: string[];
  /** 3: everyone can picture it; 2: familiar, but its weight is a surprise; 1: niche. */
  familiarity: 1 | 2 | 3;
}

/** The catalogue loads separately from the rest of the game, without the research (see vite.config.ts). */
export function loadCatalogue(): Promise<readonly CatalogueEntry[]> {
  return import('virtual:catalogue').then((m) => m.default);
}
