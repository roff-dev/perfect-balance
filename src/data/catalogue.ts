import type { Dimensions, ShapeKind } from '../game/shapes';

export type SizeContradiction = 'large-light' | 'small-heavy';

export type Theme = 'food' | 'home' | 'yard' | 'animals';

export const THEME_NAMES: Record<Theme, string> = {
  food: 'Food and drink',
  home: 'Around the house',
  yard: 'Yard and garage',
  animals: 'Animals',
};

/** Freeplay themes. An entry can be in more than one. */
const THEMED: Record<Theme, string[]> = {
  food: ['sugar-cube', 'walnut', 'crisps', 'egg', 'clementine', 'lemon', 'apple', 'beans', 'honey', 'milk', 'bread', 'sugar', 'wine', 'pineapple', 'water-bottle', 'watermelon', 'potatoes', 'keg'],
  home: ['lego-brick', 'die', 'marble', 'two-pence', 'pound-coin', 'aa-battery', 'smartphone', 'balloon', 'paperback', 'mug', 'cushion', 'cardboard-box', 'laptop', 'dictionary', 'doorstop', 'cat', 'retriever', 'microwave', 'suitcase', 'mattress', 'sofa', 'washing-machine', 'fridge', 'upright-piano'],
  yard: ['aa-battery', 'cardboard-box', 'doorstop', 'brick', 'scale-weight', 'tyre', 'bucket', 'wheelie-bin', 'car-battery', 'hay-bale', 'cement', 'oil-drum', 'round-bale', 'safe', 'pallet-bricks', 'car', 'granite'],
  animals: ['egg', 'walnut', 'cat', 'retriever', 'sheep', 'panda', 'horse', 'cow', 'rhino', 'hay-bale', 'round-bale'],
};

export interface CatalogueEntry {
  id: string;
  /** Descriptive enough to picture: "Bag of cement", not "Cement". */
  name: string;
  weightKg: number;
  dimensionsM: Dimensions;
  canBePrompt: boolean;
  canBeInventory: boolean;
  sizeContradiction?: SizeContradiction;
  shape: ShapeKind;
  color: string;
  themes: Theme[];
  /** Catalogue version the entry first appeared in; older puzzles never see newer entries. */
  addedIn: number;
}

type Flag = 'prompt' | SizeContradiction;

function entry(id: string, name: string, weightKg: number, [l, w, h]: [number, number, number], shape: ShapeKind, color: string, ...flags: Flag[]): CatalogueEntry {
  const contradiction = flags.find((f): f is SizeContradiction => f !== 'prompt');
  return {
    id,
    name,
    weightKg,
    dimensionsM: { l, w, h },
    canBePrompt: flags.includes('prompt'),
    canBeInventory: true,
    ...(contradiction && { sizeContradiction: contradiction }),
    shape,
    color,
    themes: (Object.keys(THEMED) as Theme[]).filter((t) => THEMED[t].includes(id)),
    addedIn: 1,
  };
}

/** Everyday things built from simple shapes, roughly lightest to heaviest. */
export const CATALOGUE: CatalogueEntry[] = [
  entry('lego-brick', 'Lego brick', 0.0023, [0.032, 0.016, 0.0115], 'box', '#c4433a'),
  entry('ping-pong-ball', 'Ping-pong ball', 0.0027, [0.04, 0.04, 0.04], 'ball', '#f1ebdf', 'large-light'),
  entry('sugar-cube', 'Sugar cube', 0.004, [0.016, 0.016, 0.016], 'box', '#f3efe6'),
  entry('marble', 'Glass marble', 0.005, [0.016, 0.016, 0.016], 'ball', '#4f8796'),
  entry('die', 'Six-sided die', 0.005, [0.016, 0.016, 0.016], 'box', '#ece5d6'),
  entry('two-pence', 'Two-pence coin', 0.00712, [0.0259, 0.0259, 0.00203], 'disc', '#b06a3b'),
  entry('pound-coin', 'Pound coin', 0.00875, [0.0234, 0.0234, 0.0028], 'disc', '#c9a648'),
  entry('walnut', 'Walnut in its shell', 0.012, [0.032, 0.03, 0.034], 'ball', '#9c7a52'),
  entry('aa-battery', 'AA battery', 0.023, [0.0145, 0.0145, 0.0505], 'cylinder', '#33403f'),
  entry('crisps', 'Bag of crisps', 0.03, [0.2, 0.07, 0.27], 'box', '#d9a83e', 'large-light'),
  entry('golf-ball', 'Golf ball', 0.0459, [0.0427, 0.0427, 0.0427], 'ball', '#f2eee5'),
  entry('egg', "Hen's egg", 0.058, [0.044, 0.044, 0.057], 'ball', '#e6d2b0'),
  entry('tennis-ball', 'Tennis ball', 0.058, [0.067, 0.067, 0.067], 'ball', '#c8cf4c'),
  entry('clementine', 'Clementine', 0.07, [0.058, 0.058, 0.048], 'ball', '#e08a2e'),
  entry('lemon', 'Lemon', 0.1, [0.058, 0.058, 0.075], 'ball', '#e3c34a'),
  entry('cricket-ball', 'Cricket ball', 0.16, [0.072, 0.072, 0.072], 'ball', '#9e3b2e', 'prompt'),
  entry('apple', 'Apple', 0.18, [0.08, 0.08, 0.075], 'ball', '#b5452f', 'prompt'),
  entry('smartphone', 'Smartphone', 0.19, [0.147, 0.072, 0.0079], 'box', '#2f3236'),
  entry('balloon', 'Party balloon', 0.003, [0.28, 0.28, 0.32], 'ball', '#c8524a', 'large-light'),
  entry('paperback', 'Paperback novel', 0.25, [0.178, 0.111, 0.025], 'box', '#d9c9a3'),
  entry('mug', 'Coffee mug', 0.35, [0.09, 0.09, 0.095], 'tub', '#5d7d8c', 'prompt'),
  entry('beans', 'Tin of baked beans', 0.415, [0.074, 0.074, 0.11], 'cylinder', '#6f8fa3', 'prompt'),
  entry('football', 'Football', 0.43, [0.22, 0.22, 0.22], 'ball', '#ede8de', 'large-light'),
  entry('honey', 'Jar of honey', 0.45, [0.08, 0.08, 0.1], 'jar', '#d39a3a', 'prompt'),
  entry('cushion', 'Sofa cushion', 0.5, [0.45, 0.45, 0.15], 'box', '#8a9a7b', 'large-light'),
  entry('milk', 'Pint of milk', 0.6, [0.075, 0.075, 0.15], 'bottle', '#f0eee8'),
  entry('boule', 'Pétanque boule', 0.7, [0.074, 0.074, 0.074], 'ball', '#8e9397', 'small-heavy'),
  entry('bread', 'Loaf of bread', 0.8, [0.25, 0.12, 0.12], 'box', '#c58f52'),
  entry('sugar', 'Bag of sugar', 1, [0.12, 0.075, 0.17], 'box', '#d8ccb2', 'prompt'),
  entry('cardboard-box', 'Empty cardboard box', 1, [0.6, 0.45, 0.45], 'box', '#c19a6b', 'large-light'),
  entry('wine', 'Bottle of wine', 1.3, [0.076, 0.076, 0.3], 'bottle', '#3f5a43', 'prompt'),
  entry('laptop', 'Laptop', 1.4, [0.32, 0.22, 0.018], 'box', '#9aa0a6'),
  entry('pineapple', 'Pineapple', 1.6, [0.13, 0.13, 0.25], 'pineapple', '#8e8f3e', 'prompt'),
  entry('dictionary', 'Hardback dictionary', 1.8, [0.25, 0.18, 0.07], 'box', '#7b3b3b'),
  entry('doorstop', 'Cast-iron doorstop', 2, [0.08, 0.08, 0.06], 'box', '#4a4e52', 'small-heavy'),
  entry('water-bottle', 'Two-litre bottle of water', 2.05, [0.11, 0.11, 0.31], 'bottle', '#a9c6d4'),
  entry('brick', 'House brick', 2.3, [0.215, 0.1025, 0.065], 'box', '#b5654a', 'prompt'),
  entry('cat', 'House cat', 4.5, [0.46, 0.15, 0.25], 'animal', '#8c7a66', 'prompt'),
  entry('scale-weight', 'Cast-iron scale weight', 5, [0.1, 0.1, 0.09], 'cylinder', '#3f4347', 'small-heavy'),
  entry('watermelon', 'Watermelon', 5, [0.26, 0.2, 0.2], 'ball', '#5f7f4a', 'prompt'),
  entry('bowling-ball', 'Bowling ball', 6.8, [0.218, 0.218, 0.218], 'ball', '#2d4f6e', 'prompt'),
  entry('shot-put', 'Shot put', 7.26, [0.12, 0.12, 0.12], 'ball', '#4b4f52', 'small-heavy'),
  entry('tyre', 'Car tyre', 10, [0.65, 0.65, 0.205], 'disc', '#2b2b2b', 'prompt'),
  entry('bucket', 'Bucket of water', 10.5, [0.3, 0.3, 0.29], 'tub', '#6c8fa6'),
  entry('gold-bar', 'Gold bar', 12.4, [0.255, 0.08, 0.04], 'box', '#d4a83a', 'small-heavy'),
  entry('potatoes', 'Sack of potatoes', 12.5, [0.42, 0.3, 0.22], 'ball', '#a88a5c', 'prompt'),
  entry('wheelie-bin', 'Empty wheelie bin', 12, [0.58, 0.74, 1.07], 'box', '#3d5a45', 'large-light'),
  entry('microwave', 'Microwave oven', 15, [0.48, 0.37, 0.28], 'box', '#d8d4cc', 'prompt'),
  entry('kettlebell', 'Kettlebell', 16, [0.2, 0.2, 0.27], 'ball', '#3c3f42', 'small-heavy'),
  entry('car-battery', 'Car battery', 18, [0.28, 0.175, 0.19], 'box', '#2f3a33'),
  entry('suitcase', 'Packed suitcase', 20, [0.7, 0.45, 0.25], 'box', '#6b4f3a'),
  entry('hay-bale', 'Small bale of hay', 22, [0.9, 0.45, 0.35], 'box', '#d4b56a'),
  entry('cement', 'Bag of cement', 25, [0.6, 0.4, 0.12], 'box', '#9a948a', 'prompt'),
  entry('mattress', 'Double mattress', 25, [1.9, 1.35, 0.25], 'box', '#e9e3d8', 'large-light'),
  entry('retriever', 'Golden retriever', 30, [0.9, 0.3, 0.6], 'animal', '#c79a52', 'prompt'),
  entry('sofa', 'Two-seater sofa', 45, [1.6, 0.9, 0.8], 'box', '#5e6e7e', 'large-light'),
  entry('keg', 'Full keg of beer', 63, [0.4, 0.4, 0.6], 'keg', '#a9adb1', 'prompt'),
  entry('washing-machine', 'Washing machine', 70, [0.6, 0.6, 0.85], 'box', '#ece9e3', 'prompt'),
  entry('sheep', 'Sheep', 70, [1.2, 0.5, 0.8], 'animal', '#e6dfd0'),
  entry('fridge', 'Fridge-freezer', 75, [0.6, 0.65, 1.8], 'box', '#e4e2dd'),
  entry('man', 'Adult man', 80, [0.5, 0.3, 1.75], 'person', '#6d7f94', 'prompt'),
  entry('panda', 'Giant panda', 100, [1.5, 0.6, 0.8], 'animal', '#ece8e0', 'prompt'),
  entry('oil-drum', 'Full oil drum', 190, [0.585, 0.585, 0.88], 'cylinder', '#3e6b8a', 'prompt'),
  entry('upright-piano', 'Upright piano', 230, [1.5, 0.6, 1.25], 'box', '#3a2a20', 'prompt'),
  entry('vending-machine', 'Vending machine', 300, [0.9, 0.8, 1.8], 'box', '#9b3a33', 'prompt'),
  entry('round-bale', 'Round bale of hay', 300, [1.2, 1.2, 1.2], 'cylinder', '#cfae62', 'prompt'),
  entry('safe', 'Industrial safe', 500, [0.8, 0.8, 1.2], 'box', '#5b6268', 'prompt', 'small-heavy'),
  entry('horse', 'Horse', 500, [2.4, 0.6, 1.6], 'animal', '#7a5236', 'prompt'),
  entry('cow', 'Dairy cow', 600, [2.4, 0.8, 1.5], 'animal', '#4a3b32', 'prompt'),
  entry('pallet-bricks', 'Pallet of bricks', 1150, [1, 1, 1], 'box', '#b06248'),
  entry('car', 'Small car', 1100, [3.6, 1.6, 1.45], 'box', '#4f6f8f', 'prompt'),
  entry('rhino', 'White rhino', 2300, [3.7, 1, 1.8], 'animal', '#8a8580'),
  entry('granite', 'Cubic metre of granite', 2700, [1, 1, 1], 'box', '#8f8a84', 'small-heavy'),
];
