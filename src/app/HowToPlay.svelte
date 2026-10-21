<script lang="ts">
  import { onMount } from 'svelte';
  import { CONFIG } from '../game/config';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  const light = Math.round((1 - CONFIG.margin.min) * 100);
  const heavy = Math.round((CONFIG.margin.max - 1) * 100);

  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="how-title">
  <div class="sheet">
    <header>
      <h2 id="how-title">How to play</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>

    <ol>
      <li><span>The thing on the left pan is the one to match.</span></li>
      <li><span>Drag things from the shelf onto the right pan. Hold <strong>Reset</strong> to clear it and start again.</span></li>
      <li><span>When you think it's even, hold <strong>Lock in</strong>. The scale lets go and shows how close you came.</span></li>
    </ol>
    <p>Within {light}% light or {heavy}% heavy counts as balanced. There are {CONFIG.roundsPerGame} rounds a day, the same for everyone, and a new puzzle comes out at midnight UTC.</p>

    <h3>Handy to know</h3>
    <ul>
      <li>Tap something on your pan to turn it with the arrows. With a keyboard, <kbd>Q</kbd> and <kbd>E</kbd> turn it and <kbd>V</kbd> switches between the whole scale and a close-up.</li>
      <li>To add several of one thing, point at or tap its tile and use <strong>−</strong> and <strong>+</strong> (or <kbd>-</kbd> and <kbd>+</kbd> on a focused tile), then drag it over. Up to {CONFIG.maxBatch} drop in one after another.</li>
      <li>No mouse? Press <kbd>Enter</kbd> on a tile to hold it over your pan, move it with the arrow keys (<kbd>Shift</kbd> for small steps), then <kbd>Enter</kbd> to drop it or <kbd>Esc</kbd> to put it back.</li>
      <li>The pencil opens notes and a calculator that converts between g, kg, tonnes, oz, lb and stone.</li>
      <li>Archive has every past puzzle. Freeplay lets you change the rules.</li>
    </ul>
  </div>
</dialog>

<style>
  dialog {
    width: min(100% - 2 * var(--space-4), 32rem);
    max-height: calc(100svh - 2 * var(--space-4));
    padding: 0;
    border: 0;
    border-radius: var(--radius-tile);
    background: var(--paper-raised);
    color: var(--ink);
    box-shadow: 0 24px 60px -24px rgb(31 27 23 / 0.6);
  }

  dialog::backdrop {
    background: rgb(31 27 23 / 0.4);
  }

  .sheet {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) 0 0;
  }

  h2 {
    font-size: 26px;
  }

  h3 {
    margin-top: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--paper-sunk);
    font-size: 20px;
  }

  p,
  ul {
    margin: 0;
    color: var(--ink-soft);
  }

  /* a real sequence, so numbered, in the display face */
  ol {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    counter-reset: step;
  }

  ol li {
    display: grid;
    grid-template-columns: 1.6rem 1fr;
    counter-increment: step;
  }

  ol li::before {
    content: counter(step);
    color: var(--brass-ink);
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 22px;
    line-height: 1.1;
  }

  ul {
    display: grid;
    gap: var(--space-2);
    padding-left: 1.1em;
  }

  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 0 0.35em;
    border: 1px solid var(--paper-sunk);
    border-radius: 5px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 0.85em;
    text-align: center;
  }

  .close {
    display: grid;
    place-items: center;
    width: var(--target);
    height: var(--target);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .close path {
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
</style>
