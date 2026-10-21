<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { spokenResult, VERDICT_WORDS, type Result } from '../game/judge';
  import VerdictGlyph from './VerdictGlyph.svelte';

  interface Props {
    result: Result;
    /** After the last round the button leads to the score instead. */
    last: boolean;
    onnext: () => void;
  }

  let { result, last, onnext }: Props = $props();

  // the reveal after the beam stops (notes items 5 and 6): the card, the count, the verdict, the button
  const ENTER_MS = 300;
  const COUNT_MS = 1300;
  const VERDICT_MS = 150;
  const BUTTON_MS = 350;

  const chars = $derived([...result.percent]);
  const decimals = $derived(result.percent.includes('.') ? 1 : 0);
  /** The final reading in its last digit's units: "103.8%" is 1038. An empty pan or "<0.1%" doesn't count up. */
  const final = $derived(result.percent.startsWith('<') ? 0 : Number(result.percent.replace(/\D/g, '')));
  let n = $state(0);
  let stage = $state<'count' | 'verdict' | 'ready'>('count');
  let next = $state<HTMLButtonElement>();
  let frame = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  /** Which place (0 for the last digit) each character of the reading is, or -1 for "." and "%". */
  const places = $derived.by(() => {
    let k = chars.filter((c) => /\d/.test(c)).length;
    return chars.map((c) => (/\d/.test(c) ? --k : -1));
  });

  /**
   * An odometer: the last wheel turns with the count, and each wheel above only turns while the
   * one below rolls from 9 to 0, so the reading is never between two numbers once it stops.
   */
  function wheel(k: number): number {
    const unit = 10 ** k;
    const whole = Math.floor(n / unit);
    const rest = n - whole * unit;
    return (whole % 10) + (k === 0 ? rest : Math.max(0, rest - (unit - 1)));
  }

  /** Zeros in front of the number so far are shown faintly, as on a counter that hasn't reached them. */
  const leading = (k: number) => k > decimals && Math.floor(n / 10 ** k) === 0;

  const ease = (p: number) => 1 - (1 - p) ** 4;

  /** Skips to the end: a tap or a key while it's still counting. */
  export function finish(): void {
    if (stage === 'ready') return;
    cancelAnimationFrame(frame);
    for (const t of timers) clearTimeout(t);
    n = final;
    stage = 'ready';
  }

  $effect(() => {
    if (stage === 'ready') void tick().then(() => next?.focus({ preventScroll: true }));
  });

  onMount(() => {
    if (prefersReducedMotion.current) {
      finish();
      return;
    }
    const start = performance.now() + ENTER_MS;
    const count = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / COUNT_MS));
      n = p >= 1 ? final : final * ease(p);
      if (p < 1) frame = requestAnimationFrame(count);
    };
    frame = requestAnimationFrame(count);
    timers.push(
      setTimeout(() => (stage = 'verdict'), ENTER_MS + COUNT_MS + VERDICT_MS),
      setTimeout(() => (stage = 'ready'), ENTER_MS + COUNT_MS + VERDICT_MS + BUTTON_MS),
    );
    return () => {
      cancelAnimationFrame(frame);
      for (const t of timers) clearTimeout(t);
    };
  });
</script>

<div class="dim" aria-hidden="true"></div>
<div class="place">
  <section class="ticket {result.verdict}" aria-label="Result">
    <p class="visually-hidden">{spokenResult(result)}</p>
    <p class="value" aria-hidden="true">
      {#each chars as c, i (i)}
        {#if places[i]! >= 0}
          <span class="wheel" class:leading={stage === 'count' && leading(places[i]!)}>
            <span class="strip" style:transform="translate3d(0, {-wheel(places[i]!)}em, 0)">
              {#each { length: 11 }, d (d)}
                <span>{d % 10}</span>
              {/each}
            </span>
          </span>
        {:else}
          <span class="glyph">{c}</span>
        {/if}
      {/each}
    </p>
    <p class="verdict" class:shown={stage !== 'count'} aria-hidden="true">
      <VerdictGlyph verdict={result.verdict} />
      {VERDICT_WORDS[result.verdict]}
    </p>
    <div class="actions">
      {#if stage === 'ready'}
        <button type="button" class="next" bind:this={next} onclick={onnext}>{last ? 'See your score' : 'Next round'}</button>
      {/if}
    </div>
  </section>
</div>

<style>
  /* the screen dims a little behind the result */
  .dim {
    position: fixed;
    inset: 0;
    z-index: 2;
    background: rgb(31 27 23 / 0.26);
    pointer-events: none;
    animation: fade 300ms ease-out;
  }

  /* centred over the scale, in the part of the screen the prompt and the tools leave clear */
  .place {
    position: fixed;
    inset: var(--clear-top, 0) var(--clear-right, 0) var(--clear-bottom, 0) var(--clear-left, 0);
    z-index: 3;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    pointer-events: none;
  }

  /* a weighing machine's printed ticket: the share card's double brass rule over raised paper */
  .ticket {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    /* only as wide as its reading (with room around it), so the pans still show either side */
    width: max-content;
    max-width: 100%;
    padding: var(--space-5) var(--space-6);
    border: 4px double var(--brass);
    border-radius: var(--radius-tile);
    background: var(--paper-raised);
    box-shadow: 0 24px 60px -24px rgb(31 27 23 / 0.6);
    pointer-events: auto;
    animation: rise 300ms cubic-bezier(0.2, 0.9, 0.3, 1);
  }

  /* wider screens have room to spare, so the card is never just a frame around its reading */
  @media (min-width: 600px) and (min-height: 501px) {
    .ticket {
      min-width: 340px;
    }
  }

  .value {
    display: flex;
    align-items: flex-end;
    gap: 0.06em;
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: clamp(52px, 5vw + 32px, 76px);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    color: var(--ink);
  }

  /* the drums of §4.4, turned by the count rather than sprung */
  .wheel {
    position: relative;
    display: inline-block;
    width: 1ch;
    height: 1em;
    overflow: hidden;
    border-radius: 0.1em;
    background: var(--paper-sunk);
    box-shadow: inset 0 0 0 1px rgb(31 27 23 / 0.06);
    transition: color 200ms ease-out;
  }

  .wheel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(rgb(31 27 23 / 0.16), transparent 28%, transparent 72%, rgb(31 27 23 / 0.16));
    pointer-events: none;
  }

  .leading {
    color: rgb(31 27 23 / 0.25);
  }

  .strip {
    display: flex;
    flex-direction: column;
    will-change: transform;
  }

  .strip span {
    height: 1em;
    line-height: 1;
    text-align: center;
  }

  .glyph {
    line-height: 1;
  }

  .verdict {
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: clamp(24px, 1vw + 20px, 30px);
    line-height: 1.1;
    opacity: 0;
    transform: scale(1.25);
  }

  /* lands like a stamp */
  .verdict.shown {
    opacity: 1;
    transform: none;
    transition:
      opacity 160ms ease-out,
      transform 260ms cubic-bezier(0.3, 1.5, 0.5, 1);
  }

  .balanced .verdict {
    color: var(--balanced);
  }

  .heavy .verdict {
    color: var(--heavy);
  }

  .light .verdict {
    color: var(--light);
  }

  /* holds the button's space from the start, so the card doesn't grow when it appears */
  .actions {
    align-self: stretch;
    display: grid;
    min-height: 52px;
    padding-top: var(--space-5);
    border-top: 1px solid var(--paper-sunk);
  }

  /* Lock in's enamel pill (HoldButton .primary), pressed with a click rather than held */
  .next {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    padding: 0 var(--space-6);
    border: 1.5px solid var(--enamel);
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    animation: fade 250ms ease-out;
    transition:
      background-color 150ms ease-out,
      box-shadow 150ms ease-out,
      transform 150ms ease-out;
  }

  /* lifts a little and lightens, with a brass edge taken from the ticket's rule (not on touch, where it would stick) */
  @media (hover: hover) {
    .next:hover {
      background: color-mix(in oklab, var(--enamel), white 12%);
      box-shadow:
        0 0 0 2px var(--paper-raised),
        0 0 0 3.5px var(--brass),
        0 8px 18px -8px rgb(31 27 23 / 0.5);
      transform: translateY(-1px);
    }
  }

  .next:active {
    transform: scale(0.98);
    box-shadow: none;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.97);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dim,
    .ticket,
    .next {
      animation-duration: 150ms;
    }

    .next:hover {
      transform: none;
    }

    .ticket {
      animation-name: fade;
    }

    .verdict.shown {
      transition: opacity 150ms ease-out;
    }
  }

  /* a short landscape phone: a smaller reading so the ticket fits */
  @media (orientation: landscape) and (max-height: 500px) {
    .ticket {
      gap: var(--space-2);
      padding: var(--space-3) var(--space-5);
    }

    .value {
      font-size: 44px;
    }

    .verdict {
      font-size: 22px;
    }

    .actions {
      min-height: 44px;
      padding-top: var(--space-3);
    }

    .next {
      min-height: 44px;
    }
  }
</style>
