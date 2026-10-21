import type { Result, Verdict } from './judge';

export const GLYPHS: Record<Verdict, string> = { balanced: '■', heavy: '▲', light: '▼' };

const percentOnly = (r: Result) => r.percent.replace('%', '');
const wins = (results: Result[]) => results.filter((r) => r.verdict === 'balanced').length;

/** Spoiler-free: the percentages don't give away any weights. */
export function shareText(n: number, results: Result[], url: string): string {
  return [
    `Perfect Balance #${n} · ${wins(results)}/${results.length}`,
    results.map((r) => GLYPHS[r.verdict]).join(' '),
    results.map(percentOnly).join(' · '),
    url,
  ].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * The system share sheet on touch screens, otherwise the clipboard: with a mouse the sheet is a
 * detour, since the result is going to be pasted somewhere anyway.
 */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      // closing the share sheet isn't an error
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/** The clipboard API, or the old copy command where that's blocked or missing (it needs HTTPS). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const focused = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'position: fixed; opacity: 0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    focused?.focus();
    return copied;
  }
}
