import { box, cylinder, ellipsoid, lathe, scaled } from './shapes';

export interface Item {
  id: string;
  name: string;
  color: string;
  /** Hull points in physics units. */
  points: Float32Array;
}

export interface Round {
  unitsPerMetre: number;
  prompt: Item;
  inventory: Item[];
}

/** Real diameter of the pan for this round; the physics pan is always 1 unit across. */
const PAN_METRES = 0.6;
const k = 1 / PAN_METRES;

const item = (id: string, name: string, color: string, metres: Float32Array): Item => ({
  id,
  name,
  color,
  points: scaled(metres, k),
});

/** A fixed round of everyday things, until rounds are generated from the catalogue. */
export function practiceRound(): Round {
  return {
    unitsPerMetre: k,
    prompt: item('potatoes', 'Sack of potatoes', '#a88a5c', ellipsoid(0.21, 0.11, 0.15, 3, 8)),
    inventory: [
      item('brick', 'House brick', '#b5654a', box(0.215, 0.065, 0.1025)),
      item('beans', 'Tin of baked beans', '#6f8fa3', cylinder(0.037, 0.11, 12)),
      item('paperback', 'Paperback novel', '#d9c9a3', box(0.178, 0.025, 0.111)),
      item('sugar', 'Bag of sugar', '#d8ccb2', box(0.12, 0.17, 0.075)),
      item('cricket-ball', 'Cricket ball', '#9e3b2e', ellipsoid(0.036, 0.036, 0.036)),
      item('mug', 'Coffee mug', '#5d7d8c', lathe([[0.04, -0.0475], [0.045, 0.0475]], 10)),
      item('honey', 'Jar of honey', '#d39a3a', lathe([[0.04, -0.05], [0.04, 0.035], [0.034, 0.05]], 8)),
      item('watermelon', 'Watermelon', '#5f7f4a', ellipsoid(0.13, 0.1, 0.1, 4, 10)),
      item('wine', 'Bottle of wine', '#3f5a43', lathe([[0.038, -0.15], [0.038, 0.05], [0.015, 0.11], [0.015, 0.15]], 10)),
      item('egg', "Hen's egg", '#e6d2b0', ellipsoid(0.0285, 0.022, 0.022)),
      item('trainers', 'Boxed pair of trainers', '#b9a385', box(0.33, 0.12, 0.2)),
      item('pineapple', 'Pineapple', '#c49a3c', lathe([[0.055, -0.1], [0.065, -0.03], [0.055, 0.06], [0.02, 0.1]], 8)),
    ],
  };
}
