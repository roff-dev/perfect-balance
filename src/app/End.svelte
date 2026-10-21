<script lang="ts">
  import { onMount } from 'svelte';
  import { countdown, msUntilNext } from '../game/daily';
  import { spokenResult, type Result } from '../game/judge';
  import { copyText, shareResult, shareText } from '../game/share';
  import type { Mode } from '../game/storage';
  import Drum from '../ui/Drum.svelte';
  import VerdictGlyph from '../ui/VerdictGlyph.svelte';

  interface Props {
    prompts: string[];
    results: Result[];
    /** A numbered puzzle; a freeplay game has none. */
    puzzle?: { mode: Mode; n: number };
    /** A freeplay game that ran until the first miss. */
    endless?: boolean;
    /** The streak before and after this game, when it's today's puzzle just finished. */
    streak?: { from: number; to: number };
    unsaved: boolean;
    now: number;
    ontoast: (message: string) => void;
    onplay: () => void;
    onrules: () => void;
    onarchive: () => void;
    onhome: () => void;
  }

  let { prompts, results, puzzle, endless = false, streak, unsaved, now, ontoast, onplay, onrules, onarchive, onhome }: Props = $props();

  const wins = $derived(results.filter((r) => r.verdict === 'balanced').length);
  const digits = $derived([...String(wins)].map(Number));
  let heading: HTMLElement;
  let shownStreak = $state(0);

  onMount(() => {
    heading.focus();
    shownStreak = streak?.from ?? 0;
    const timer = streak && setTimeout(() => (shownStreak = streak.to), 1100);
    return () => clearTimeout(timer);
  });

  async function share(): Promise<void> {
    if (!puzzle) return;
    const outcome = await shareResult(shareText(puzzle.n, results, `${location.origin}/`));
    if (outcome === 'copied') ontoast('Copied');
    else if (outcome === 'failed') ontoast("Couldn't share or copy from this browser.");
  }

  async function copyLink(): Promise<void> {
    ontoast((await copyText(location.href)) ? 'Link copied' : "Couldn't copy the link from this browser.");
  }
</script>

<main class="end">
  <h1 class="score" bind:this={heading} tabindex="-1" aria-label={endless ? `You balanced ${wins} in a row.` : `You balanced ${wins} out of ${results.length}.`}>
    <span class="drums" aria-hidden="true">
      {#each digits as digit, i (i)}
        <Drum {digit} delay={250 + i * 60} />
      {/each}
    </span>
    {#if !endless}
      <span class="of" aria-hidden="true">/{results.length}</span>
    {/if}
  </h1>
  <p class="line">
    {#if endless}
      {wins === 0 ? 'Missed the first one.' : `${wins} in a row.`}
    {:else}
      {wins} out of {results.length}.{#if puzzle?.mode === 'daily'}{' '}Same time tomorrow.{/if}
    {/if}
  </p>

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

  <div class="actions">
    {#if puzzle}
      <button type="button" class="primary" onclick={share}>Share</button>
    {:else}
      <button type="button" class="primary" onclick={onplay}>Play again</button>
    {/if}
    <nav class="links">
      {#if puzzle?.mode === 'archive'}
        <button type="button" class="link" onclick={onarchive}>Back to the archive</button>
      {:else if puzzle}
        <button type="button" class="link" onclick={onarchive}>Archive</button>
        <button type="button" class="link" onclick={onrules}>Freeplay</button>
      {:else}
        <button type="button" class="link" onclick={onrules}>Change rules</button>
        <button type="button" class="link" onclick={copyLink}>Copy link</button>
      {/if}
      <button type="button" class="link" onclick={onhome}>{puzzle?.mode === 'daily' ? 'Home' : "Today's puzzle"}</button>
    </nav>
  </div>

  <div class="tally">
    {#if streak}
      <p class="streak">
        Streak
        {#key shownStreak}
          <strong class:grew={shownStreak === streak.to && streak.to > streak.from}>{shownStreak}</strong>
        {/key}
      </p>
    {/if}
    {#if puzzle}
      <p>New puzzle in <span class="time">{countdown(msUntilNext(now))}</span></p>
    {/if}
    {#if unsaved}
      <p class="unsaved">Progress won't be saved in this browser.</p>
    {/if}
  </div>
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

  .drums {
    display: inline-flex;
    gap: 0.04em;
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

  .actions {
    display: grid;
    gap: var(--space-2);
  }

  .primary {
    min-height: 52px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
  }

  .primary:active {
    transform: scale(0.98);
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-5);
  }

  .link {
    min-height: var(--target);
    padding: 0;
    border: 0;
    background: none;
    font-weight: 600;
    text-decoration: underline;
    text-decoration-color: var(--brass);
    text-decoration-thickness: 2px;
    text-underline-offset: 5px;
    cursor: pointer;
  }

  .link:hover {
    text-decoration-color: var(--ink);
  }

  .tally {
    color: var(--ink-soft);
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
  }

  .tally p {
    margin: 0;
  }

  .streak strong {
    display: inline-block;
    color: var(--ink);
  }

  /* the new number drops in like the next figure on a counter */
  .grew {
    animation: tick-over 420ms cubic-bezier(0.3, 1.4, 0.5, 1);
  }

  @keyframes tick-over {
    from {
      opacity: 0;
      transform: translateY(-0.7em);
    }
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
    .actions {
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-5);
    }

    .primary {
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
        'tally actions';
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

    .actions {
      grid-area: actions;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: var(--space-4);
    }

    .primary {
      padding: 0 var(--space-6);
    }

    .tally {
      grid-area: tally;
      align-self: center;
    }
  }
</style>
