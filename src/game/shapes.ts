// Convex hull point clouds for simple objects. Each shape is drawn inside a unit cube centred on
// the origin, then stretched to the object's real length, width and height.

export type ShapeKind = 'box' | 'cylinder' | 'disc' | 'ball' | 'tub' | 'jar' | 'bottle' | 'keg' | 'pineapple' | 'animal' | 'person';

/** Shapes that roll or topple rather than stack. */
export const ROUNDED: ReadonlySet<ShapeKind> = new Set(['ball', 'pineapple', 'animal', 'person']);

export interface Dimensions {
  /** Along x. */
  l: number;
  /** Along z. */
  w: number;
  /** Upright. */
  h: number;
}

function box(): number[] {
  const p: number[] = [];
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) p.push(x, y, z);
  return p;
}

/** Stacked rings, bottom to top: [radius, y][]. */
function lathe(rings: [radius: number, y: number][], sides: number): number[] {
  const p: number[] = [];
  for (const [r, y] of rings) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      p.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  return p;
}

/** A low-poly ellipsoid: a few latitude rings plus the poles. */
function ellipsoid(rings: number, sides: number): number[] {
  const p: number[] = [0, -0.5, 0, 0, 0.5, 0];
  for (let j = 1; j <= rings; j++) {
    const lat = (j / (rings + 1)) * Math.PI - Math.PI / 2;
    const c = Math.cos(lat) / 2;
    for (let i = 0; i < sides; i++) {
      // offset alternate rings so the facets don't line up into stripes
      const a = ((i + (j % 2) * 0.5) / sides) * Math.PI * 2;
      p.push(Math.cos(a) * c, Math.sin(lat) / 2, Math.sin(a) * c);
    }
  }
  return p;
}

const UNIT: Record<ShapeKind, () => number[]> = {
  box,
  cylinder: () => lathe([[0.5, -0.5], [0.5, 0.5]], 12),
  disc: () => lathe([[0.5, -0.5], [0.5, 0.5]], 16),
  ball: () => ellipsoid(4, 10),
  tub: () => lathe([[0.43, -0.5], [0.5, 0.5]], 10),
  jar: () => lathe([[0.5, -0.5], [0.5, 0.3], [0.42, 0.5]], 10),
  bottle: () => lathe([[0.5, -0.5], [0.5, 0.17], [0.2, 0.37], [0.2, 0.5]], 10),
  keg: () => lathe([[0.44, -0.5], [0.5, 0], [0.44, 0.5]], 12),
  pineapple: () => lathe([[0.42, -0.5], [0.5, -0.15], [0.42, 0.3], [0.15, 0.5]], 8),
  animal: () => ellipsoid(3, 8),
  person: () => lathe([[0.36, -0.5], [0.5, 0.12], [0.32, 0.36], [0.22, 0.5]], 8),
};

/** In metres, centred, resting with its base at y = -h / 2. */
export function hullPoints(kind: ShapeKind, { l, w, h }: Dimensions): Float32Array {
  const unit = UNIT[kind]();
  const out = new Float32Array(unit.length);
  for (let i = 0; i < unit.length; i += 3) {
    out[i] = unit[i]! * l;
    out[i + 1] = unit[i + 1]! * h;
    out[i + 2] = unit[i + 2]! * w;
  }
  return out;
}

export function scaled(points: Float32Array, k: number): Float32Array {
  return points.map((v) => v * k);
}
