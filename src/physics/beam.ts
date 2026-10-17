import { RIG } from './rig';

const DEG = Math.PI / 180;

/**
 * The beam is kinematic: its angle is scripted from the result, never simulated, so the
 * verdict can't be undone by a jittery stack. Positive angles lower the right-hand pan.
 */
export type BeamMotion =
  | { kind: 'locked' }
  | { kind: 'wobble'; amplitude: number; tau: number; frequency: number }
  | { kind: 'tip'; direction: 1 | -1; duration: number }
  /** Eases back to level from wherever the reveal left it. */
  | { kind: 'level'; from: number; duration: number };

export const WOBBLE: BeamMotion = { kind: 'wobble', amplitude: 1.6 * DEG, tau: 0.55, frequency: 1.1 };

/** A clean miss drops fast; a near miss sinks slowly. `ratio` is total / prompt weight. */
export function tipFor(ratio: number): BeamMotion {
  const severity = ratio <= 0 ? 1 : Math.min(1, Math.abs(Math.log(ratio)) / Math.LN2);
  return { kind: 'tip', direction: ratio > 1 ? 1 : -1, duration: 1.1 - 0.65 * severity };
}

export function beamAngle(motion: BeamMotion, t: number): number {
  switch (motion.kind) {
    case 'locked':
      return 0;
    case 'wobble':
      return motion.amplitude * Math.exp(-t / motion.tau) * Math.sin(2 * Math.PI * motion.frequency * t);
    case 'tip': {
      // accelerates like a falling arm, then stops dead on the rest pad
      const k = Math.min(1, t / motion.duration);
      return motion.direction * RIG.stopAngle * k * k;
    }
    case 'level': {
      const k = Math.min(1, t / motion.duration);
      return motion.from * (1 - k * k * (3 - 2 * k));
    }
  }
}
