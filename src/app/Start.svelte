<script lang="ts">
  import { CONFIG } from '../game/config';
  import { countdown, msUntilNext, puzzleDate } from '../game/daily';
  import type { Played, Streak } from '../game/storage';
  import Sketch from '../ui/Sketch.svelte';

  interface Props {
    today: number;
    now: number;
    played: Played | undefined;
    streak: Streak;
    /** The streak shown, which is 0 once a day has been missed. */
    current: number;
    lapsed: boolean;
    onplay: () => void;
    onarchive: () => void;
    onfreeplay: () => void;
    onbackup: () => void;
  }

  let { today, now, played, streak, current, lapsed, onplay, onarchive, onfreeplay, onbackup }: Props = $props();

  const date = $derived(puzzleDate(today).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }));
  const action = $derived(
    played?.done ? "See today's result" : played?.rounds.length ? `Carry on: round ${played.rounds.length + 1} of ${CONFIG.roundsPerGame}` : "Play today's",
  );
</script>

<main class="start">
  <div class="sketch"><Sketch /></div>

  <div class="copy">
    <h1>Perfect Balance</h1>
    <p class="date">No. {today}, {date}</p>
    <p class="lede">Stack everyday things on one pan until it weighs the same as the other.</p>

    <button type="button" class="play" onclick={onplay}>{action}</button>

    <div class="tally">
      {#if lapsed}
        <p class="welcome">Your streak's gone. The scale doesn't hold grudges.</p>
      {:else if current > 0}
        <p>Streak <strong>{current}</strong>{#if streak.best > current}, best <strong>{streak.best}</strong>{/if}</p>
      {/if}
      <p>New puzzle in <span class="time">{countdown(msUntilNext(now))}</span></p>
    </div>

    <nav class="links">
      <button type="button" class="link" onclick={onarchive}>Archive</button>
      <button type="button" class="link" onclick={onfreeplay}>Freeplay</button>
      <button type="button" class="link" onclick={onbackup}>Back up progress</button>
    </nav>
  </div>
</main>

<style>
  .start {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-5);
    width: min(100%, 30rem);
    min-height: 100svh;
    margin: 0 auto;
    padding: max(var(--space-5), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-5), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  }

  .sketch {
    width: min(100%, 22rem);
  }

  h1 {
    font-size: var(--text-display);
    line-height: 0.95;
    letter-spacing: -0.02em;
  }

  .date {
    margin: var(--space-3) 0 0;
    color: var(--brass-ink);
    font-weight: 600;
  }

  .lede {
    max-width: 30ch;
    margin: var(--space-2) 0 var(--space-5);
    color: var(--ink-soft);
  }

  .play {
    width: 100%;
    min-height: 52px;
    padding: 0 var(--space-6);
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

  .tally {
    margin-top: var(--space-4);
    color: var(--ink-soft);
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
  }

  .tally p {
    margin: 0;
  }

  .tally strong {
    color: var(--ink);
  }

  .tally .welcome {
    margin-bottom: var(--space-1);
    color: var(--ink);
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 19px;
    line-height: 1.25;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-5);
    margin-top: var(--space-3);
  }

  .link {
    min-height: var(--target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
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

  @media (min-width: 768px) {
    .play {
      width: auto;
    }
  }

  /* the drawing beside the words */
  @media (min-width: 900px), (orientation: landscape) and (max-height: 500px) {
    .start {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      align-items: center;
      align-content: center;
      gap: var(--space-7);
      width: min(100%, 64rem);
    }

    .sketch {
      width: 100%;
    }
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .start {
      gap: var(--space-6);
    }

    h1 {
      font-size: 48px;
    }

    .lede {
      margin-bottom: var(--space-3);
    }

    .tally {
      margin-top: var(--space-2);
    }
  }
</style>
