// The scale in normalised physics units: the pan is 1 unit across whatever the round's real size.
// Shared by the physics worker and the renderer, so it must stay free of three.js and Jolt.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x y z w

export interface ConvexPart {
  points: Float32Array;
  offset: Vec3;
}

export const RIG = {
  pivot: [0, 2.0, 0] as Vec3,
  beamHalf: [0.95, 0.04, 0.05] as Vec3,
  armLength: 0.9,
  /** Pan centre below the beam tip. */
  hangDrop: 1.1,
  panRadius: 0.5,
  /** Half-thickness of the pan floor. Thinner floors let small objects sink at lock-in. */
  panFloorHalf: 0.04,
  rimHalfHeight: 0.04,
  rimSegments: 20,
  /** Lightest the pans ever get; heavier loads raise it (see PhysicsWorld.updatePanMasses). */
  panBaseMass: 40,
  panDamping: 2,
  stopAngle: (17 * Math.PI) / 180,
  padHalf: [0.25, 0.06, 0.25] as Vec3,
  floorHalf: [4, 0.1, 4] as Vec3,
};

/** Top of the pan floor, in pan-local space. */
export const PAN_FLOOR_TOP = 0.015;

export function panRestY(): number {
  return RIG.pivot[1] - RIG.hangDrop;
}

/** Height of the rest pads, so a pan at the stop angle just touches its pad. */
export function padTopY(): number {
  const panBottom = panRestY() + PAN_FLOOR_TOP - 2 * RIG.panFloorHalf;
  return panBottom - RIG.armLength * Math.sin(RIG.stopAngle) - 0.004;
}

export function prism(radius: number, halfHeight: number, sides: number): Float32Array {
  const p = new Float32Array(sides * 6);
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    p.set([x, -halfHeight, z, x, halfHeight, z], i * 6);
  }
  return p;
}

export function box(hx: number, hy: number, hz: number): Float32Array {
  const p: number[] = [];
  for (const x of [-hx, hx]) for (const y of [-hy, hy]) for (const z of [-hz, hz]) p.push(x, y, z);
  return new Float32Array(p);
}

/** Floor disc plus a ring of rim blocks, each a convex hull, in pan-local space. */
export function panParts(): ConvexPart[] {
  const R = RIG.panRadius;
  const t = RIG.panFloorHalf;
  const parts: ConvexPart[] = [{ points: prism(R, t, 24), offset: [0, PAN_FLOOR_TOP - t, 0] }];
  const n = RIG.rimSegments;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const seg = box(0.012, RIG.rimHalfHeight, (Math.PI * R) / n + 0.01);
    for (let j = 0; j < seg.length; j += 3) {
      const x = seg[j]!;
      const z = seg[j + 2]!;
      seg[j] = x * c - z * s;
      seg[j + 2] = x * s + z * c;
    }
    parts.push({ points: seg, offset: [c * R, RIG.rimHalfHeight, s * R] });
  }
  return parts;
}

/** Rotates v by the inverse of q. */
function inverseRotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 * cross(-q.xyz, v); v' = v + w*t + cross(-q.xyz, t)
  const tx = 2 * (-qy * vz + qz * vy);
  const ty = 2 * (-qz * vx + qx * vz);
  const tz = 2 * (-qx * vy + qy * vx);
  return [
    vx + qw * tx + (-qy * tz + qz * ty),
    vy + qw * ty + (-qz * tx + qx * tz),
    vz + qw * tz + (-qx * ty + qy * tx),
  ];
}

export type Location = 'pan' | 'floor' | 'lost';

/**
 * Where a body is relative to one pan: on it (centre above the pan floor, inside the rim
 * plus 5 cm), fallen to the floor, or lost through the pan floor or the ground.
 */
export function locate(panPos: Vec3, panQuat: Quat, bodyPos: Vec3): Location {
  if (bodyPos[1] < -0.05) return 'lost';
  const l = inverseRotate(panQuat, [bodyPos[0] - panPos[0], bodyPos[1] - panPos[1], bodyPos[2] - panPos[2]]);
  const radial = Math.hypot(l[0], l[2]);
  if (radial >= RIG.panRadius + 0.05 || l[1] <= -0.4 || l[1] >= 1.0) return 'floor';
  if (l[1] < PAN_FLOOR_TOP - 0.025 && radial < RIG.panRadius - 0.05) return 'lost';
  return 'pan';
}
