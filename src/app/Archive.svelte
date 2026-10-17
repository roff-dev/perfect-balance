<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFIG } from '../game/config';
  import { puzzleDate } from '../game/daily';
  import { savedResult } from '../game/judge';
  import type { Played, Progress, RoundResult } from '../game/storage';
  import VerdictGlyph from '../ui/VerdictGlyph.svelte';

  interface Props {
    today: number;
    progress: Progress;
    onplay: (n: number) => void;
    onback: () => void;
  }

  let { today, progress, onplay, onback }: Props = $props();

  interface Row {
    n: number;
    day: string;
    played: Played | undefined;
  }

  const utc = (n: number, options: Intl.DateTimeFormatOptions) => puzzleDate(n).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });

  /** Newest first, grouped by month. Today's puzzle isn't in the archive. */
  const months = $derived.by(() => {
    const out: { name: string; rows: Row[] }[] = [];
    for (let n = today - 1; n >= 1; n--) {
      const name = utc(n, { month: 'long', year: 'numeric' });
      if (out.at(-1)?.name !== name) out.push({ name, rows: [] });
      // a finished daily counts, otherwise whatever was played from here
      const daily = progress.daily[n];
      const played = daily?.done ? daily : (progress.archive[n] ?? daily);
      out.at(-1)!.rows.push({ n, day: utc(n, { weekday: 'short', day: 'numeric', month: 'short' }), played });
    }
    return out;
  });

  const wins = (p: Played) => p.rounds.filter((r) => r.win).length;
  const verdictOf = (r: RoundResult) => savedResult(r, 1).verdict;

  function status(p: Played | undefined): string {
    if (!p || p.rounds.length === 0) return 'Not played';
    if (!p.done) return `Played ${p.rounds.length} of ${CONFIG.roundsPerGame}`;
    return `${wins(p)} out of ${CONFIG.roundsPerGame}`;
  }

  let heading: HTMLElement;
  onMount(() => heading.focus());
</script>

<main class="archive">
  <header>
    <button type="button" class="back" onclick={onback}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
      Back
    </button>
    <h1 bind:this={heading} tabindex="-1">Archive</h1>
    <p class="note">Every past puzzle, still the same for everyone. Playing them here doesn't change your streak.</p>
  </header>

  {#if months.length === 0}
    <p class="empty">Nothing here yet. Each day's puzzle joins the archive the day after.</p>
  {:else}
    {#each months as month (month.name)}
      <section>
        <h2>{month.name}</h2>
        <ul>
          {#each month.rows as row (row.n)}
            <li>
              <button type="button" class="row" class:done={row.played?.done} onclick={() => onplay(row.n)} aria-label="Puzzle {row.n}, {row.day}: {status(row.played)}">
                <span class="n">No. {row.n}</span>
                <span class="day">{row.day}</span>
                <span class="status">
                  {#if row.played?.done}
                    <span class="glyphs">
                      {#each row.played.rounds as r, i (i)}
                        <span class={verdictOf(r)}><VerdictGlyph verdict={verdictOf(r)} /></span>
                      {/each}
                    </span>
                    <span class="score">{wins(row.played)}/{CONFIG.roundsPerGame}</span>
                  {:else}
                    {status(row.played)}
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</main>

<style>
  .archive {
    width: min(100%, 34rem);
    min-height: 100svh;
    margin: 0 auto;
    padding: max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--target);
    margin-left: -6px;
    padding: 0 var(--space-2) 0 0;
    border: 0;
    background: none;
    font-weight: 600;
    cursor: pointer;
  }

  .back path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h1 {
    margin-top: var(--space-3);
    font-size: var(--text-title);
    outline: none;
  }

  .note {
    max-width: 40ch;
    margin: var(--space-2) 0 var(--space-5);
    color: var(--ink-soft);
  }

  .empty {
    margin: 0;
    padding: var(--space-5) 0;
    border-top: 1px solid var(--paper-sunk);
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 20px;
    line-height: 1.3;
  }

  section + section {
    margin-top: var(--space-5);
  }

  h2 {
    position: sticky;
    top: 0;
    padding: var(--space-2) 0;
    background: var(--paper);
    color: var(--brass-ink);
    font-size: 20px;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--paper-sunk);
  }

  li {
    border-bottom: 1px solid var(--paper-sunk);
  }

  .row {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--target);
    padding: var(--space-2) var(--space-1);
    border: 0;
    background: none;
    text-align: left;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .row:hover {
    background: var(--paper-raised);
  }

  .n {
    font-weight: 600;
  }

  .day,
  .status {
    color: var(--ink-soft);
  }

  .done .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--ink);
    font-weight: 600;
  }

  .glyphs {
    display: inline-flex;
    gap: 3px;
    font-size: 15px;
  }

  .glyphs span {
    display: grid;
  }

  .balanced {
    color: var(--balanced);
  }

  .heavy {
    color: var(--heavy);
  }

  .light {
    color: var(--light);
  }

  .score {
    min-width: 2.2em;
    text-align: right;
  }
</style>
