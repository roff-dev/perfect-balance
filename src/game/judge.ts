import { CONFIG } from './config';

export type Verdict = 'balanced' | 'heavy' | 'light';

export interface Result {
  totalKg: number;
  /** Player's total over the prompt's weight. */
  ratio: number;
  verdict: Verdict;
  /** As shown on the drums: "97.8%", "1240%", "<0.1%". */
  percent: string;
}

export const VERDICT_WORDS: Record<Verdict, string> = {
  balanced: 'Balanced.',
  heavy: 'Too heavy.',
  light: 'Too light.',
};

export function verdictFor(ratio: number): Verdict {
  if (ratio > CONFIG.margin.max) return 'heavy';
  if (ratio < CONFIG.margin.min) return 'light';
  return 'balanced';
}

/** One decimal under 1000%, whole numbers above; an empty pan reads 0.0%. */
export function formatPercent(ratio: number): string {
  if (ratio === 0) return '0.0%';
  if (ratio < 0.001) return '<0.1%';
  return ratio < 10 ? `${(ratio * 100).toFixed(1)}%` : `${Math.round(ratio * 100)}%`;
}

/** Only what's on the player's pan counts; anything on the floor is ignored. */
export function judge(bodies: { kg: number; onPan: boolean }[], promptKg: number): Result {
  const totalKg = bodies.reduce((sum, b) => (b.onPan ? sum + b.kg : sum), 0);
  const ratio = totalKg / promptKg;
  return { totalKg, ratio, verdict: verdictFor(ratio), percent: formatPercent(ratio) };
}

/** A result rebuilt from saved progress. The saved win stands even if the window has changed since. */
export function savedResult({ ratio, win }: { ratio: number; win: boolean }, promptKg: number): Result {
  return { totalKg: ratio * promptKg, ratio, verdict: win ? 'balanced' : ratio > 1 ? 'heavy' : 'light', percent: formatPercent(ratio) };
}

/** The result as a screen reader should hear it: "98.1 percent. Balanced." */
export function spokenResult({ percent, verdict }: Result): string {
  const amount = percent.startsWith('<') ? `less than ${percent.slice(1, -1)} percent` : `${percent.slice(0, -1)} percent`;
  return `${amount}. ${VERDICT_WORDS[verdict]}`;
}
