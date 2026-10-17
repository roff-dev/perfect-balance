<script lang="ts">
  import { onMount } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { spokenResult, VERDICT_WORDS, type Result } from '../game/judge';
  import Drum from './Drum.svelte';
  import VerdictGlyph from './VerdictGlyph.svelte';

  interface Props {
    result: Result;
  }

  let { result }: Props = $props();

  /** Each drum starts this long after the one to its left, so they settle left to right. */
  const STAGGER = 60;
  /** Roughly how long a drum takes to settle. */
  const SETTLE = 900;

  const chars = $derived([...result.percent]);
  const digits = $derived(chars.filter((c) => /\d/.test(c)).length);
  let landed = $state(false);

  onMount(() => {
    const wait = prefersReducedMotion.current ? 150 : digits * STAGGER + SETTLE;
    const timer = setTimeout(() => (landed = true), wait);
    return () => clearTimeout(timer);
  });

  function drumIndex(at: number): number {
    return chars.slice(0, at).filter((c) => /\d/.test(c)).length;
  }
</script>

<div class="readout {result.verdict}" class:landed role="img" aria-label={spokenResult(result)}>
  <p class="value" aria-hidden="true">
    {#each chars as c, i (i)}
      {#if /\d/.test(c)}
        <Drum digit={Number(c)} delay={drumIndex(i) * STAGGER} />
      {:else}
        <span class="glyph">{c}</span>
      {/if}
    {/each}
  </p>
  <p class="verdict" aria-hidden="true">
    <VerdictGlyph verdict={result.verdict} />
    {VERDICT_WORDS[result.verdict]}
  </p>
</div>

<style>
  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1) var(--space-4);
    animation: appear 150ms ease-out;
  }

  .value {
    display: flex;
    align-items: flex-end;
    gap: 0.06em;
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: var(--drum-size, 56px);
    font-weight: 500;
    line-height: 1;
    color: var(--ink);
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
    font-size: var(--verdict-size, 26px);
    line-height: 1.1;
    opacity: 0;
    transform: translateY(0.3em);
    transition:
      opacity 220ms ease-out,
      transform 320ms cubic-bezier(0.2, 1.4, 0.4, 1);
  }

  .landed .verdict {
    opacity: 1;
    transform: none;
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

  @keyframes appear {
    from {
      opacity: 0;
    }
  }
</style>
