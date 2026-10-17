<script lang="ts">
  import { onMount } from 'svelte';
  import { Spring, prefersReducedMotion } from 'svelte/motion';

  interface Props {
    digit: number;
    /** When this drum starts turning, in ms. */
    delay: number;
  }

  let { digit, delay }: Props = $props();

  // two full turns of 0–9 plus spare rows for the overshoot
  const ROWS = Array.from({ length: 22 }, (_, i) => i % 10);
  const roll = new Spring(0, { stiffness: 0.07, damping: 0.42 });

  onMount(() => {
    if (prefersReducedMotion.current) {
      roll.set(10 + digit, { instant: true });
      return;
    }
    const timer = setTimeout(() => roll.set(10 + digit), delay);
    return () => clearTimeout(timer);
  });
</script>

<span class="drum">
  <span class="strip" style:transform="translate3d(0, {-roll.current}em, 0)">
    {#each ROWS as n, i (i)}
      <span>{n}</span>
    {/each}
  </span>
</span>

<style>
  .drum {
    position: relative;
    display: inline-block;
    width: 1ch;
    height: 1em;
    overflow: hidden;
    border-radius: 0.1em;
    background: var(--paper-sunk);
    box-shadow: inset 0 0 0 1px rgb(31 27 23 / 0.06);
  }

  /* shading for the curve of the drum */
  .drum::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(rgb(31 27 23 / 0.16), transparent 28%, transparent 72%, rgb(31 27 23 / 0.16));
    pointer-events: none;
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
</style>
