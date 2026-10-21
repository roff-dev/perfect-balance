<script lang="ts">
  import { onMount } from 'svelte';
  import { UNITS, type Display, type Key, type Op } from '../game/calculator';

  interface Props {
    notes: string;
    display: Display;
    onpress: (key: Key) => void;
    onclose: () => void;
  }

  let { notes = $bindable(), display, onpress, onclose }: Props = $props();

  type Tab = 'notes' | 'calculator';
  let tab = $state<Tab>('notes');
  let first: HTMLButtonElement;

  const OPS: Record<string, Op> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷' };
  const KEYS: { key: Key; label: string; name?: string; kind?: string }[] = [
    { key: 'clear', label: 'C', name: 'Clear', kind: 'quiet' },
    { key: 'back', label: '⌫', name: 'Delete', kind: 'quiet' },
    { key: '÷', label: '÷', name: 'Divide', kind: 'op' },
    { key: '×', label: '×', name: 'Multiply', kind: 'op' },
    { key: '7', label: '7' },
    { key: '8', label: '8' },
    { key: '9', label: '9' },
    { key: '−', label: '−', name: 'Subtract', kind: 'op' },
    { key: '4', label: '4' },
    { key: '5', label: '5' },
    { key: '6', label: '6' },
    { key: '+', label: '+', name: 'Add', kind: 'op' },
    { key: '1', label: '1' },
    { key: '2', label: '2' },
    { key: '3', label: '3' },
    { key: '=', label: '=', name: 'Equals', kind: 'equals' },
    { key: '0', label: '0', kind: 'zero' },
    { key: '.', label: '.', name: 'Point' },
  ];

  /** Typing on the calculator. Enter on one of its buttons presses that button, as usual. */
  function calculatorKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let key: Key | undefined;
    if (/^\d$/.test(e.key)) key = e.key as Key;
    else if (e.key === '.' || e.key === ',') key = '.';
    else if (e.key in OPS) key = OPS[e.key];
    else if (e.key === '=' || (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement))) key = '=';
    else if (e.key === 'Backspace') key = 'back';
    else if (e.key === 'Delete') key = 'clear';
    if (!key) return;
    e.preventDefault();
    onpress(key);
  }

  /** Nothing typed here reaches the game: V, Q, E and Enter mean other things there. */
  function keydown(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  onMount(() => first.focus());
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions: it only keeps keys from the game -->
<section class="slip" id="slip" aria-label="Notes and calculator" onkeydown={keydown}>
  <header>
    <div class="tabs" role="group" aria-label="Show">
      <button type="button" bind:this={first} aria-pressed={tab === 'notes'} onclick={() => (tab = 'notes')}>Notes</button>
      <button type="button" aria-pressed={tab === 'calculator'} onclick={() => (tab = 'calculator')}>Calculator</button>
    </div>
    <button type="button" class="close" aria-label="Close notes" onclick={onclose}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
    </button>
  </header>

  <div class="part notes" class:shown={tab === 'notes'}>
    <h2><label for="notes">Notes</label></h2>
    <textarea id="notes" bind:value={notes} placeholder="brick ~2 kg, need 5" spellcheck="false" rows="4"></textarea>
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex: the keyboard types into it -->
  <div class="part calculator" class:shown={tab === 'calculator'} role="group" aria-labelledby="calculator" tabindex="0" onkeydown={calculatorKey}>
    <h2 id="calculator">Calculator</h2>
    <div class="display">
      <p class="sum" aria-hidden="true">{display.sum}</p>
      <output aria-live="polite">
        {#if display.error}
          <span class="error">{display.error}</span>
        {:else}
          <span class="value">{display.value}</span>{#if display.unit}<span class="unit">{display.unit}</span>{/if}
        {/if}
      </output>
    </div>
    <div class="units" role="group" aria-label="Units: tap to give the number a unit, or to convert it">
      {#each UNITS as unit (unit)}
        <button type="button" aria-pressed={!display.error && display.unit === unit} onclick={() => onpress(unit)}>{unit}</button>
      {/each}
    </div>
    <div class="keys">
      {#each KEYS as k (k.key)}
        <button type="button" class={k.kind} aria-label={k.name} onclick={() => onpress(k.key)}>{k.label}</button>
      {/each}
    </div>
  </div>

  <p class="cleared">Cleared when the next round starts.</p>
</section>

<style>
  /* a trader's weighing slip: a double brass rule over raised paper */
  .slip {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    max-height: 52svh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-3) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-3), env(safe-area-inset-bottom))
      max(var(--space-4), env(safe-area-inset-left));
    border-top: 4px double var(--brass);
    background: var(--paper-raised);
  }

  /* the pressed and selected states show the tap */
  .slip button {
    -webkit-tap-highlight-color: transparent;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .tabs {
    display: flex;
    padding: 3px;
    border-radius: var(--radius-control);
    background: var(--paper-sunk);
  }

  .tabs button {
    min-height: 38px;
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-control);
    background: none;
    color: var(--ink-soft);
    font-weight: 600;
    cursor: pointer;
  }

  .tabs [aria-pressed='true'] {
    background: var(--paper-raised);
    color: var(--ink);
    box-shadow: 0 2px 6px -3px rgb(31 27 23 / 0.4);
  }

  .close {
    display: grid;
    place-items: center;
    width: var(--target);
    height: var(--target);
    margin-right: -10px;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }

  .close path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .part {
    display: none;
    flex-direction: column;
    gap: var(--space-2);
  }

  .part.shown {
    display: flex;
  }

  .calculator:focus-visible {
    outline-offset: 6px;
    border-radius: 4px;
  }

  h2 {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ruled like a docket pad; the rules scroll with the writing */
  textarea {
    --rule: 28px;
    width: 100%;
    min-height: calc(var(--rule) * 4 + 8px);
    padding: 4px 2px;
    border: 0;
    border-bottom: 1px solid var(--paper-sunk);
    background: repeating-linear-gradient(transparent 0 calc(var(--rule) - 1px), var(--paper-sunk) calc(var(--rule) - 1px) var(--rule)) local;
    background-position: 0 4px;
    color: var(--ink);
    font: inherit;
    font-size: 16px;
    line-height: var(--rule);
    resize: vertical;
  }

  textarea::placeholder {
    color: var(--ink-soft);
    opacity: 0.8;
  }

  textarea:focus-visible {
    outline-offset: 4px;
    border-radius: 2px;
  }

  .display {
    padding: var(--space-2) var(--space-3);
    border-radius: 10px;
    background: var(--paper);
    box-shadow: inset 0 1px 3px rgb(31 27 23 / 0.12);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .sum {
    min-height: 1.5em;
    margin: 0;
    overflow: hidden;
    color: var(--ink-soft);
    font-size: var(--text-small);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  output {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 0.3em;
    min-height: 40px;
    overflow: hidden;
    white-space: nowrap;
  }

  .value {
    font-size: 30px;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .unit {
    color: var(--brass-ink);
    font-size: 20px;
    font-weight: 600;
  }

  .error {
    font-size: 17px;
    line-height: 40px;
  }

  .units {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .units button {
    min-height: var(--target);
    border: 1px solid var(--paper-sunk);
    border-radius: var(--radius-control);
    background: none;
    color: var(--brass-ink);
    font-weight: 600;
    cursor: pointer;
  }

  /* the unit the number is in */
  .units [aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper-raised);
  }

  .keys {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: var(--target);
    gap: var(--space-1);
  }

  .keys button {
    border: 1px solid var(--paper-sunk);
    border-radius: 12px;
    background: var(--paper);
    font-size: 19px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .keys button:active,
  .units button:active {
    transform: scale(0.96);
  }

  .keys .op {
    color: var(--brass-ink);
    font-size: 22px;
  }

  .keys .quiet {
    color: var(--ink-soft);
  }

  .keys .equals {
    grid-row: span 2;
    border: 1.5px solid var(--ink);
    background: var(--paper-raised);
    font-size: 22px;
  }

  .keys .zero {
    grid-column: span 2;
  }

  .cleared {
    margin: 0;
    color: var(--ink-soft);
    font-size: var(--text-small);
  }

  @container (min-width: 300px) {
    .units {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (hover: hover) {
    .keys button:hover,
    .units button:hover {
      border-color: var(--ink-soft);
    }
  }

  /* a column beside the scene: no tabs, both parts at once */
  @media (min-width: 1024px) and (min-height: 501px) {
    .slip {
      max-height: none;
      gap: var(--space-4);
      padding: var(--space-5);
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
      background:
        linear-gradient(var(--brass), var(--brass)) top / 100% 1px no-repeat,
        linear-gradient(var(--brass), var(--brass)) 0 4px / 100% 1px no-repeat,
        var(--paper-raised);
    }

    .tabs {
      display: none;
    }

    header {
      justify-content: flex-end;
      margin-bottom: calc(-1 * var(--space-6));
    }

    .part {
      display: flex;
    }

    h2 {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      color: var(--brass-ink);
      font-size: 20px;
    }

    .calculator {
      margin-top: var(--space-2);
    }
  }

  /* the landscape column */
  @media (orientation: landscape) and (max-height: 500px) {
    .slip {
      max-height: none;
      padding-top: max(var(--space-2), env(safe-area-inset-top));
      padding-left: var(--space-3);
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
    }

    .tabs button {
      padding: 0 var(--space-3);
    }
  }
</style>
