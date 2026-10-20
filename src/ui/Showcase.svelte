<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { claimIntro, intro } from '../app/intro.svelte';
  import type { ScaleView } from '../scene/showcase';
  import Sketch from './Sketch.svelte';
  import { hardwareContext } from './webgl';

  interface Props {
    /** The cookie notice has been eaten; once it changes to true, crumbs fall into a pan. */
    cookieEaten: boolean;
    /** The opening played on an earlier visit, so it doesn't play again. */
    introSeen: boolean;
    /** The opening has started playing (it's remembered from then on). */
    onintroseen: () => void;
  }

  let { cookieEaten, introSeen, onintroseen }: Props = $props();

  /** The opening waits this long for three.js; after that the page shows and the scale fades in when it's ready. */
  const INTRO_WAIT_MS = 2000;

  let slot: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let view: ScaleView | undefined;
  /** No 3D here (no WebGL, software WebGL or Save-Data), so the ink sketch stands in. */
  let sketch = $state(false);
  /** The 3D scale is drawn, so its place takes pointer input. */
  let live = $state(false);

  // the eaten cookie's crumbs land on the scale, if it's there to catch them
  let wasEaten = untrack(() => cookieEaten);
  $effect(() => {
    if (cookieEaten && !wasEaten) view?.crumbs();
    wasEaten = cookieEaten;
  });

  onMount(() => {
    // only on the first visit, and only on the first start screen of that page load
    const first = claimIntro() && !untrack(() => introSeen);
    const context = hardwareContext(canvas);
    if (!context) {
      sketch = true;
      return;
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let gone = false;
    let waiting = first && !still;
    if (waiting) intro.veiled = intro.playing = true;

    /** The page stops waiting for the opening: the words show, and the scale fades in when it can. */
    const giveUp = () => {
      waiting = false;
      intro.veiled = intro.playing = false;
    };
    const timer = waiting ? setTimeout(giveUp, INTRO_WAIT_MS) : undefined;

    // any input during the opening hurries it to the end, so it never holds anyone up
    const skip = () => (view ? view.skip() : giveUp());
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchmove'] as const;
    const listen = (on: boolean) => inputs.forEach((type) => (on ? addEventListener : removeEventListener)(type, skip, { capture: true, passive: true }));
    if (waiting) listen(true);

    void import('../scene/showcase')
      .then(({ showScale }) =>
        showScale(canvas, {
          slot,
          context,
          onreveal: () => (intro.veiled = false),
          ondone: () => {
            intro.playing = false;
            listen(false);
          },
        }),
      )
      .then((ready) => {
        if (gone) return ready.dispose();
        clearTimeout(timer);
        view = ready;
        live = true;
        ready.start(waiting);
        if (waiting) onintroseen();
      })
      .catch(() => {
        // the scale couldn't be set up: the sketch stands in, and the page shows
        sketch = true;
        giveUp();
        listen(false);
      });

    return () => {
      gone = true;
      clearTimeout(timer);
      listen(false);
      giveUp();
      view?.dispose();
    };
  });
</script>

<div class="showcase" class:live bind:this={slot}>
  {#if sketch}<Sketch />{/if}
  <!-- a toy for the pointer: it does nothing the page needs, so it's hidden from assistive tech -->
  <canvas bind:this={canvas} class:gone={sketch} aria-hidden="true"></canvas>
</div>

<style>
  /* the drawing's proportions, whether the sketch or the 3D scale fills it */
  .showcase {
    position: relative;
    aspect-ratio: 320 / 170;
  }

  .live {
    touch-action: pan-y;
    cursor: grab;
    -webkit-tap-highlight-color: transparent;
  }

  .live:active {
    cursor: grabbing;
  }

  /* past its place, so the shadow and a scale turned side on have room; input goes to the place itself */
  canvas {
    position: absolute;
    top: -14%;
    left: -12%;
    width: 124%;
    height: 144%;
    opacity: 0;
    pointer-events: none;
    transition: opacity 400ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* the opening: over the whole screen and the page (showcase.ts sizes and moves it there) */
  canvas:global(.flying) {
    z-index: 10;
  }

  canvas:global(.shown) {
    opacity: 1;
  }

  .gone {
    display: none;
  }

  @media (prefers-reduced-motion: reduce) {
    canvas {
      transition-duration: 150ms;
    }
  }
</style>
