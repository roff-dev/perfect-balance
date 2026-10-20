<script lang="ts">
  import { onMount } from 'svelte';
  import type { CookieView } from '../scene/cookie';

  interface Props {
    /** The last bite is taken and the notice has gone. */
    oneaten: () => void;
  }

  let { oneaten }: Props = $props();

  /** The cookie's canvas, in CSS pixels. */
  const SIZE = 104;
  /** Where the cookie's edge is, from the canvas's centre, in CSS pixels: it's seen from above, so wider than it is tall. */
  const RIM = { x: 40, y: 30 };
  /** Each bite is round the edge from the last, starting at the top right. */
  const BITE_ANGLES = [-0.6, 2.5, 1.0];
  const BITE_MS = 280;

  interface Crumb {
    id: number;
    x: number;
    y: number;
    dx: number;
    spin: number;
    ink: boolean;
  }

  let canvas: HTMLCanvasElement;
  let view: CookieView | undefined;
  /** The cookie is ready (or couldn't be drawn), so the notice can arrive. */
  let shown = $state(false);
  let failed = $state(false);
  let bites = $state(0);
  let eating = $state(false);
  let leaving = $state(false);
  let crumbs = $state<Crumb[]>([]);
  let crumbId = 0;
  let height = $state(0);

  // the desktop banner pushes the start screen down rather than covering it (Start.svelte reads this)
  $effect(() => {
    const root = document.documentElement.style;
    if (shown && !leaving) root.setProperty('--notice-space', `${height}px`);
    else root.removeProperty('--notice-space');
    return () => root.removeProperty('--notice-space');
  });

  /** The canvas is smaller in the desktop banner; bites and crumbs are drawn to its size now. */
  const scale = () => (canvas?.clientWidth || SIZE) / SIZE;

  /** Three overlapping circles out of the edge: the shape of a bite. */
  function bite(angle: number): string[] {
    const s = scale();
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const x = SIZE / 2 + RIM.x * cos;
    const y = SIZE / 2 + RIM.y * sin;
    return [-1, 0, 1].map((side) => {
      const r = side ? 11 : 13;
      const cx = (x - side * 10 * sin + (side ? 3 : 0) * cos) * s;
      const cy = (y + side * 10 * cos + (side ? 3 : 0) * sin) * s;
      return `radial-gradient(circle at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, transparent ${r * s}px, #000 ${r * s + 0.5}px)`;
    });
  }

  const mask = $derived(BITE_ANGLES.slice(0, bites).flatMap(bite).join(', ') || 'none');

  function scatter(angle: number): void {
    const x = (SIZE / 2 + RIM.x * Math.cos(angle)) * scale();
    const y = (SIZE / 2 + RIM.y * Math.sin(angle)) * scale();
    const fresh = Array.from({ length: 6 }, (_, i) => ({
      id: crumbId++,
      x: x + (Math.random() - 0.5) * 14,
      y: y + (Math.random() - 0.5) * 10,
      dx: (Math.random() - 0.5) * 50,
      spin: (Math.random() - 0.5) * 540,
      ink: i % 3 === 0,
    }));
    crumbs = [...crumbs, ...fresh];
    setTimeout(() => (crumbs = crumbs.filter((c) => !fresh.includes(c))), 900);
  }

  function nibble(): void {
    if (leaving || bites >= BITE_ANGLES.length) return;
    view?.hold();
    scatter(BITE_ANGLES[bites]!);
    bites++;
    if (bites === BITE_ANGLES.length) setTimeout(() => (leaving = true), BITE_MS + 120);
  }

  /** The button eats what's left, a bite at a time. */
  function eat(): void {
    if (eating) return;
    eating = true;
    if (failed) {
      leaving = true;
      return;
    }
    nibble();
    const timer = setInterval(() => {
      if (bites >= BITE_ANGLES.length) clearInterval(timer);
      else nibble();
    }, BITE_MS);
  }

  onMount(() => {
    let gone = false;
    const start = async () => {
      try {
        const { showCookie } = await import('../scene/cookie');
        const ready = await showCookie(canvas);
        if (gone) return ready.dispose();
        view = ready;
      } catch {
        failed = true;
      }
      if (!gone) shown = true;
    };
    // after the start screen has settled, like the game's own prefetch
    let cancel: () => void;
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => void start(), { timeout: 1500 });
      cancel = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(() => void start(), 300);
      cancel = () => clearTimeout(id);
    }
    return () => {
      gone = true;
      cancel();
      view?.dispose();
    };
  });
</script>

<aside
  class="notice"
  class:waiting={!shown}
  class:leaving
  aria-labelledby="cookie-title"
  bind:offsetHeight={height}
  onanimationend={(e) => e.target === e.currentTarget && leaving && oneaten()}
>
  <!-- the cookie can be bitten by pointer too; the button below does the same for everyone -->
  <button type="button" class="cookie" class:failed tabindex="-1" aria-hidden="true" onclick={nibble}>
    <canvas bind:this={canvas} width={SIZE} height={SIZE} style:mask-image={mask}></canvas>
    {#each crumbs as c (c.id)}
      <span class="crumb" class:ink={c.ink} style:left="{c.x}px" style:top="{c.y}px" style:--dx="{c.dx}px" style:--spin="{c.spin}deg"></span>
    {/each}
  </button>
  <div class="words">
    <h2 id="cookie-title">No cookies here.</h2>
    <p>Well, except this one. Nothing on this site tracks you, and your progress stays in your browser. <a href="/privacy">Privacy</a></p>
    <button type="button" class="action" disabled={eating} onclick={eat}>{failed ? 'Got it' : 'Eat the cookie'}</button>
  </div>
</aside>

<style>
  /* at the top, over the drawing, so it never covers Play or the links */
  .notice {
    position: fixed;
    z-index: 9;
    left: max(var(--space-4), env(safe-area-inset-left));
    right: max(var(--space-4), env(safe-area-inset-right));
    top: max(var(--space-4), env(safe-area-inset-top));
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4) var(--space-3);
    border-radius: var(--radius-tile);
    background: var(--paper-raised);
    box-shadow: 0 18px 44px -20px rgb(31 27 23 / 0.55);
    animation: arrive 560ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }

  /* laid out but unseen (and unheard) until the cookie is drawn */
  .waiting {
    visibility: hidden;
    animation: none;
  }

  .leaving {
    animation: leave 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
  }

  .cookie {
    position: relative;
    width: 104px;
    height: 104px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .notice:not(.waiting) .cookie {
    animation: plop 640ms 140ms cubic-bezier(0.3, 1.4, 0.5, 1) backwards;
  }

  .cookie.failed {
    display: none;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    mask-composite: intersect;
  }

  .crumb {
    position: absolute;
    width: 5px;
    height: 4px;
    margin: -2px 0 0 -2.5px;
    border-radius: 1px;
    background: var(--brass);
    pointer-events: none;
    animation: fall 800ms cubic-bezier(0.3, 0, 0.7, 1) forwards;
  }

  .crumb.ink {
    background: var(--brass-ink);
  }

  .words {
    display: grid;
    justify-items: start;
    gap: var(--space-2);
  }

  h2 {
    font-variation-settings: var(--display-soft);
    font-size: 22px;
    line-height: 1.1;
  }

  p {
    margin: 0;
    color: var(--ink-soft);
    font-size: var(--text-small);
    line-height: 1.45;
  }

  p a {
    color: var(--ink);
    font-weight: 600;
    text-decoration-color: var(--brass);
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
  }

  .action {
    min-height: var(--target);
    margin-top: var(--space-1);
    padding: 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-weight: 600;
    cursor: pointer;
  }

  .action:active {
    transform: scale(0.98);
  }

  .action:disabled {
    cursor: default;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-32px);
    }
  }

  @keyframes leave {
    to {
      opacity: 0;
      transform: translateY(-24px);
    }
  }

  /* dropped onto the card */
  @keyframes plop {
    from {
      opacity: 0;
      transform: translateY(-36px) rotate(-12deg) scale(0.85);
    }
  }

  @keyframes fall {
    to {
      opacity: 0;
      transform: translate(var(--dx), 70px) rotate(var(--spin));
    }
  }

  @media (min-width: 640px) {
    .notice {
      right: auto;
      width: 27rem;
    }
  }

  /* desktop: a banner along the top, its contents in line with the page's */
  @media (min-width: 900px) {
    /* scrolls away with the page, which makes room for it */
    .notice {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      width: auto;
      grid-template-columns: auto 1fr auto;
      grid-template-areas:
        'cookie title action'
        'cookie text action';
      column-gap: var(--space-5);
      row-gap: var(--space-1);
      padding: var(--space-2) max(var(--space-6), (100% - 64rem) / 2);
      border-radius: 0;
      border-bottom: 2px solid var(--brass);
      box-shadow: 0 12px 32px -24px rgb(31 27 23 / 0.5);
    }

    .words {
      display: contents;
    }

    .cookie {
      grid-area: cookie;
      width: 88px;
      height: 88px;
    }

    h2 {
      grid-area: title;
      align-self: end;
    }

    p {
      grid-area: text;
      align-self: start;
    }

    .action {
      grid-area: action;
      margin: 0;
    }

    @keyframes arrive {
      from {
        transform: translateY(-100%);
      }
    }

    @keyframes leave {
      to {
        transform: translateY(-100%);
      }
    }
  }
</style>
