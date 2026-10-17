// Convex hull point clouds for simple objects, in metres, resting with their base at y = -height / 2.

export function box(l: number, h: number, w: number): Float32Array {
  const p: number[] = [];
  for (const x of [-l / 2, l / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-w / 2, w / 2]) p.push(x, y, z);
  return new Float32Array(p);
}

/** Stacked rings, bottom to top: [radius, y][]. A cylinder, a tapered tin, a bottle with a neck. */
export function lathe(rings: [radius: number, y: number][], sides: number): Float32Array {
  const p: number[] = [];
  for (const [r, y] of rings) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      p.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  return new Float32Array(p);
}

export function cylinder(radius: number, height: number, sides: number): Float32Array {
  return lathe([[radius, -height / 2], [radius, height / 2]], sides);
}

/** A low-poly ellipsoid: a few latitude rings plus the poles. */
export function ellipsoid(rx: number, ry: number, rz: number, rings = 4, sides = 8): Float32Array {
  const p: number[] = [0, -ry, 0, 0, ry, 0];
  for (let j = 1; j <= rings; j++) {
    const lat = (j / (rings + 1)) * Math.PI - Math.PI / 2;
    const c = Math.cos(lat);
    for (let i = 0; i < sides; i++) {
      // offset alternate rings so the facets don't line up into stripes
      const a = ((i + (j % 2) * 0.5) / sides) * Math.PI * 2;
      p.push(Math.cos(a) * c * rx, Math.sin(lat) * ry, Math.sin(a) * c * rz);
    }
  }
  return new Float32Array(p);
}

export function scaled(points: Float32Array, k: number): Float32Array {
  return points.map((v) => v * k);
}
