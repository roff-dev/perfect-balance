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
  /**
   * Rocks both ways, dying away to level, then (for a miss) tips to the heavier side. A win and a
   * miss rock the same, so the outcome only shows once the beam has stopped rocking.
   */
  | { kind: 'teeter'; amplitude: number; frequency: number; seconds: number; tip?: { direction: 1 | -1; duration: number } }
  /** Eases from one angle to another: back to level from wherever the reveal left it, or on to where a hurried reveal ends. */
  | { kind: 'level'; from: number; to?: number; duration: number };

export const WOBBLE: BeamMotion = { kind: 'wobble', amplitude: 1.6 * DEG, tau: 0.55, frequency: 1.1 };

/** About four swings, 3.8° then 2.7°, 1.2° and nothing, over 1.8 s. */
export const TEETER = { amplitude: 4 * DEG, frequency: 1.1, seconds: 1.8 } as const;

/** The reveal's beam: teeter, then level for a win or the tip for a miss. */
export function teeterFor(ratio: number, win: boolean): BeamMotion {
  const tip = tipFor(ratio);
  return { kind: 'teeter', ...TEETER, ...(!win && tip.kind === 'tip' && { tip: { direction: tip.direction, duration: tip.duration } }) };
}

/** How long a motion takes to come to rest, in seconds. */
export function motionSeconds(motion: BeamMotion): number {
  switch (motion.kind) {
    case 'locked':
      return 0;
    case 'wobble':
      return 5 * motion.tau;
    case 'tip':
    case 'level':
      return motion.duration;
    case 'teeter':
      return motion.seconds + (motion.tip?.duration ?? 0);
  }
}

/** Where a motion ends. */
export function finalAngle(motion: BeamMotion): number {
  if (motion.kind === 'tip') return motion.direction * RIG.stopAngle;
  if (motion.kind === 'teeter') return motion.tip ? motion.tip.direction * RIG.stopAngle : 0;
  if (motion.kind === 'level') return motion.to ?? 0;
  return 0;
}

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
    case 'teeter': {
      // the swing dies away smoothly, so the beam is level and still when it ends
      if (t < motion.seconds) return motion.amplitude * 0.5 * (1 + Math.cos((Math.PI * t) / motion.seconds)) * Math.sin(2 * Math.PI * motion.frequency * t);
      if (!motion.tip) return 0;
      const k = Math.min(1, (t - motion.seconds) / motion.tip.duration);
      return motion.tip.direction * RIG.stopAngle * k * k;
    }
    case 'level': {
      const k = Math.min(1, t / motion.duration);
      const to = motion.to ?? 0;
      return to + (motion.from - to) * (1 - k * k * (3 - 2 * k));
    }
  }
}
