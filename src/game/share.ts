import { puzzleDate } from './daily';
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

export const CARD = { width: 1200, height: 630 };

const INK = '#1f1b17';
const INK_SOFT = '#5c5249';
const PAPER = '#efe8dc';
const PAPER_SUNK = '#e4daca';
const BRASS = '#b8892f';
const VERDICT_COLOURS: Record<Verdict, string> = { balanced: '#3b6636', heavy: '#a3392a', light: '#2c5c8c' };
const DISPLAY = '"Fraunces Variable", Georgia, serif';
const UI = '"Instrument Sans Variable", Arial, sans-serif';

/** The same shapes as the on-screen glyphs, centred on (x, y). */
function glyph(ctx: CanvasRenderingContext2D, verdict: Verdict, x: number, y: number, size: number): void {
  const h = size / 2;
  ctx.fillStyle = VERDICT_COLOURS[verdict];
  ctx.beginPath();
  if (verdict === 'balanced') {
    ctx.roundRect(x - h, y - h, size, size, size * 0.1);
  } else {
    const tip = verdict === 'heavy' ? -h : h;
    ctx.moveTo(x, y + tip);
    ctx.lineTo(x + h, y - tip);
    ctx.lineTo(x - h, y - tip);
  }
  ctx.fill();
}

/** The result as a 1200×630 picture, laid out like a weighing slip. */
export async function drawCard(n: number, results: Result[], host: string): Promise<Blob> {
  await Promise.all([document.fonts.load(`500 200px ${DISPLAY}`), document.fonts.load(`600 30px ${UI}`)]);
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = CARD;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // a double brass rule round the edge, like a printed ticket
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 28, W - 56, H - 56);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `500 64px ${DISPLAY}`;
  ctx.fillText('Perfect Balance', 88, 150);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 30px ${UI}`;
  const date = puzzleDate(n).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  ctx.fillText(`No. ${n} · ${date}`, 90, 200);

  // the score, set large on the right
  const score = String(wins(results));
  const of = `/${results.length}`;
  ctx.font = `500 230px ${DISPLAY}`;
  const ofWidth = ctx.measureText(of).width;
  ctx.fillStyle = INK_SOFT;
  ctx.textAlign = 'right';
  ctx.fillText(of, W - 88, 290);
  ctx.fillStyle = INK;
  ctx.fillText(score, W - 88 - ofWidth - 4, 290);

  // five cells along the bottom: glyph over percentage
  const top = 360;
  const cellW = (W - 176) / results.length;
  ctx.fillStyle = PAPER_SUNK;
  ctx.fillRect(88, top, W - 176, 150);
  results.forEach((r, i) => {
    const cx = 88 + cellW * (i + 0.5);
    if (i > 0) {
      ctx.fillStyle = PAPER;
      ctx.fillRect(88 + cellW * i - 1.5, top, 3, 150);
    }
    glyph(ctx, r.verdict, cx, top + 52, 40);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.font = `600 34px ${UI}`;
    ctx.fillText(r.percent, cx, top + 124);
  });

  ctx.textAlign = 'left';
  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 24px ${UI}`;
  ctx.fillText(host, 90, H - 76);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No card'))), 'image/png'));
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * The picture through the system share sheet where the browser takes files, otherwise the
 * text on the clipboard. The card is drawn beforehand: Safari only shares straight after a tap.
 */
export async function shareResult(text: string, card: File | undefined): Promise<ShareOutcome> {
  if (card && navigator.canShare?.({ files: [card] })) {
    try {
      await navigator.share({ files: [card], text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
