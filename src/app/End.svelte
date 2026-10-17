<script lang="ts">
  import { onMount } from 'svelte';
  import { spokenResult, type Result } from '../game/judge';
  import Drum from '../ui/Drum.svelte';
  import VerdictGlyph from '../ui/VerdictGlyph.svelte';

  interface Props {
    prompts: string[];
    results: Result[];
    onplay: () => void;
  }

  let { prompts, results, onplay }: Props = $props();

  const wins = $derived(results.filter((r) => r.verdict === 'balanced').length);
  let heading: HTMLElement;

  onMount(() => heading.focus());
</script>

<main class="end">
  <h1 class="score" bind:this={heading} tabindex="-1" aria-label="You balanced {wins} out of {results.length}.">
    <span aria-hidden="true"><Drum digit={wins} delay={250} /></span><span class="of" aria-hidden="true">/{results.length}</span>
  </h1>
  <p class="line">{wins} of {results.length} balanced.</p>

  <ol class="list">
    {#each results as result, i (i)}
      <li class={result.verdict}>
        <span class="glyph"><VerdictGlyph verdict={result.verdict} /></span>
        <span class="percent" aria-hidden="true">{result.percent}</span>
        <span class="name">{prompts[i]}</span>
        <span class="visually-hidden">{spokenResult(result)}</span>
      </li>
    {/each}
  </ol>

  <button type="button" class="play" onclick={onplay}>Play again</button>
</main>

<style>
  .end {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-5);
    width: min(100%, 30rem);
    min-height: 100svh;
    margin: 0 auto;
    padding: max(var(--space-6), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  }

  .score {
    display: flex;
    align-items: flex-end;
    gap: 0.04em;
    font-size: clamp(96px, 18vw + 2rem, 160px);
    line-height: 1;
    outline: none;
  }

  .of {
    color: var(--ink-soft);
  }

  .line {
    margin: calc(-1 * var(--space-3)) 0 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: var(--text-title);
    line-height: 1.1;
  }

  .list {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-2) 0;
    border-block: 1px solid var(--paper-sunk);
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: 18px 5.5ch minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    min-height: var(--target);
  }

  .glyph {
    display: grid;
    place-items: center;
    font-size: 20px;
  }

  .balanced .glyph {
    color: var(--balanced);
  }

  .heavy .glyph {
    color: var(--heavy);
  }

  .light .glyph {
    color: var(--light);
  }

  .percent {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .name {
    overflow: hidden;
    color: var(--ink-soft);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .play {
    min-height: 52px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
  }

  .play:active {
    transform: scale(0.98);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (min-width: 768px) {
    .play {
      align-self: flex-start;
      padding: 0 var(--space-6);
    }
  }

  /* score on the left, rounds on the right, so nothing scrolls */
  @media (orientation: landscape) and (max-height: 500px) {
    .end {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas:
        'score list'
        'line list'
        '. play';
      align-content: center;
      gap: var(--space-3) var(--space-6);
      width: min(100%, 48rem);
      padding-block: max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-bottom));
    }

    .score {
      grid-area: score;
      font-size: 112px;
    }

    .line {
      grid-area: line;
      align-self: start;
      margin: 0;
      font-size: 24px;
    }

    .list {
      grid-area: list;
      padding: 0;
    }

    .play {
      grid-area: play;
    }
  }
</style>
