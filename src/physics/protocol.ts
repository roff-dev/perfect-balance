import type { BeamMotion } from './beam';
import type { Quat, Vec3 } from './rig';

export interface WorldOptions {
  /** Physics units per real metre for this round (the pan is always 1 unit across). */
  unitsPerMetre: number;
}

export interface BodySpec {
  id: number;
  /** Convex hull points in the body's own frame; several hulls for a concave object. */
  hulls: Float32Array[];
  pos: Vec3;
  quat: Quat;
}

/** Real weight per body id; the world caps and normalises these itself. */
export type LockMasses = [id: number, kg: number][];

export type ToWorker =
  | { type: 'init'; options: WorldOptions }
  | { type: 'scale'; options: WorldOptions }
  | { type: 'add'; body: BodySpec }
  | { type: 'remove'; id: number }
  | { type: 'clear' }
  | { type: 'lock'; masses: LockMasses }
  | { type: 'unlock' }
  | { type: 'beam'; motion: BeamMotion }
  | { type: 'tick'; dt: number };

/**
 * Pose layout: 8 floats per entry, `px py pz qx qy qz qw flags`.
 * Entries 0–2 are the left pan, right pan and beam; bodies follow in `ids` order.
 * Flag bit 0 = asleep.
 */
export const POSE_STRIDE = 8;
export const RIG_ENTRIES = 3;

export interface Snapshot {
  ids: Int32Array;
  poses: Float32Array;
  /** Smoothed wall time per tick spent stepping, ms. */
  stepMs: number;
  steps: number;
}

export type FromWorker =
  | { type: 'ready' }
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'error'; message: string };
