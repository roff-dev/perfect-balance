<script lang="ts">
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import type { PlacingState } from '../app/game';
  import type { Item } from '../game/round';
  import HoldButton from './HoldButton.svelte';
  import Readout from './Readout.svelte';
  import Tile from './Tile.svelte';

  interface Props {
    items: Item[];
    thumbs: Map<string, string>;
    placing: PlacingState;
    onreset: () => void;
    onreturnall: () => void;
    onlockin: () => void;
    onnext: () => void;
    /** After the last round the button leads to the score instead. */
    last: boolean;
    element?: HTMLElement;
  }

  let { items, thumbs, placing, onreset, onreturnall, onlockin, onnext, last, element = $bindable() }: Props = $props();

  const sink = new Spring(0, { stiffness: 0.2, damping: 0.55 });
  $effect(() => {
    sink.set(placing.putBack ? 6 : 0, { instant: prefersReducedMotion.current });
  });

  const floorCount = $derived(placing.floor.reduce((n, f) => n + f.count, 0));
  // the prompt's short descent counts as placing: touching anything skips it
  const placingPhase = $derived(placing.phase === 'placing' || placing.phase === 'intro');
  const lockLabel = $derived(
    placing.phase === 'locking' || placing.phase === 'revealing' ? 'Weighing…' : placing.panCount === 0 ? 'Lock in (empty pan)' : 'Hold to lock in',
  );
</script>

<section
  class="sheet"
  class:put-back={placing.putBack}
  class:carrying={placing.carrying !== undefined}
  bind:this={element}
  aria-label="Things to weigh"
  style:--sink="{sink.current}px"
>
  <div class="stack">
  <div class="tray" class:hidden={placing.result}>
    <div class="well" data-strip>
      {#each items as item (item.id)}
        <Tile
          {item}
          thumb={thumbs.get(item.id)}
          count={placing.onPan[item.id] ?? 0}
          full={placing.full || !placingPhase}
          held={placing.carrying === item.id}
        />
      {/each}
    </div>
    <p class="put-back-label" aria-hidden="true">Put back</p>
  </div>
  {#if placing.result}
    <div class="result">
      <Readout result={placing.result} />
    </div>
  {/if}
  </div>

  {#if placing.full && placingPhase}
    <p class="cap">That's plenty — the pan's full.</p>
  {/if}

  {#if floorCount > 0 && placingPhase}
    <div class="floor">
      <p class="floor-title">On the floor ({floorCount})</p>
      <div class="chips" data-strip>
        {#each placing.floor as group (group.itemId)}
          <button
            type="button"
            class="chip"
            data-item={group.itemId}
            data-source="floor"
            aria-label="{group.name}, {group.count} on the floor. Drag to pick one up."
          >
            {#if thumbs.get(group.itemId)}
              <img src={thumbs.get(group.itemId)} alt="" draggable="false" />
            {/if}
            <span>{group.name} <span class="n">×{group.count}</span></span>
          </button>
        {/each}
      </div>
      <button type="button" class="return" onclick={onreturnall}>Return all</button>
    </div>
  {/if}

  <div class="actions">
    {#if placing.phase === 'result'}
      <button type="button" class="next" onclick={onnext}>{last ? 'See your score' : 'Next round'}</button>
    {:else}
      <HoldButton
        label="Reset"
        name="Reset pan, hold to confirm"
        onconfirm={onreset}
        disabled={!placingPhase || placing.panCount === 0}
      />
      <div class="lock">
        <HoldButton
          primary
          label={lockLabel}
          holdingLabel="Keep holding"
          name="Lock in, hold to confirm"
          onconfirm={onlockin}
          disabled={!placingPhase || !placing.ready}
        />
      </div>
    {/if}
  </div>

  {#if placingPhase}
    <p class="hint">
      Hold something and press <kbd>Q</kbd> or <kbd>E</kbd>, or use the wheel, to turn it. Press <kbd>V</kbd> to switch view.
    </p>
  {/if}
</section>

<style>
  .sheet {
    --tile-w: 76px;
    --tile-h: 88px;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    padding: var(--space-3) 0 max(var(--space-3), env(safe-area-inset-bottom));
    background: var(--paper-raised);
    border-top: 1px solid var(--paper-sunk);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -12px 32px -24px rgb(31 27 23 / 0.35);
    transform: translate3d(0, var(--sink), 0);
  }

  /* the result takes the tray's place at the same size, so the scene doesn't resize mid-reveal */
  .stack {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  }

  .stack > * {
    grid-area: 1 / 1;
  }

  .tray.hidden {
    visibility: hidden;
  }

  .result {
    --drum-size: 56px;
    --verdict-size: 24px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 max(var(--space-4), env(safe-area-inset-right)) 0 max(var(--space-4), env(safe-area-inset-left));
  }

  .tray {
    position: relative;
    margin: 0 max(var(--space-3), env(safe-area-inset-right)) 0 max(var(--space-3), env(safe-area-inset-left));
    border-radius: 16px;
    background: var(--paper-sunk);
    box-shadow: inset 0 2px 4px rgb(31 27 23 / 0.1);
    transition: background-color 180ms ease-out;
  }

  .well {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior: contain;
    touch-action: pan-x;
    scrollbar-width: none;
    transition: opacity 180ms ease-out;
  }

  .well::-webkit-scrollbar {
    display: none;
  }

  .put-back-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 30px;
    color: var(--ink);
    opacity: 0;
    pointer-events: none;
    transition: opacity 180ms ease-out;
  }

  .put-back .tray {
    background: color-mix(in srgb, var(--paper-sunk) 86%, var(--ink));
  }

  .put-back .well {
    opacity: 0.2;
  }

  .put-back .put-back-label {
    opacity: 1;
  }

  .cap {
    margin: 0 var(--space-4);
    font-size: var(--text-small);
    font-weight: 600;
    color: var(--ink-soft);
  }

  .floor {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 max(var(--space-4), env(safe-area-inset-right)) 0 max(var(--space-4), env(safe-area-inset-left));
  }

  .floor-title {
    flex: none;
    margin: 0;
    font-size: var(--text-small);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }

  .chips {
    display: flex;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    touch-action: pan-x;
    scrollbar-width: none;
  }

  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--target);
    padding: 0 var(--space-3) 0 6px;
    border: 1px dashed rgb(92 82 73 / 0.55);
    border-radius: var(--radius-control);
    background: var(--paper);
    font-size: var(--text-small);
    font-weight: 600;
    white-space: nowrap;
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .chip img {
    width: 30px;
    height: 30px;
    pointer-events: none;
  }

  .chip .n {
    font-variant-numeric: tabular-nums;
    color: var(--brass-ink);
  }

  .return {
    flex: none;
    min-height: var(--target);
    padding: 0 var(--space-2);
    border: 0;
    background: none;
    font-size: var(--text-small);
    font-weight: 600;
    color: var(--enamel);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    padding: 0 max(var(--space-4), env(safe-area-inset-right)) 0 max(var(--space-4), env(safe-area-inset-left));
  }

  .lock {
    flex: 1;
    display: flex;
  }

  .lock :global(.hold) {
    flex: 1;
  }

  .next {
    flex: 1;
    min-height: var(--target);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
    animation: arrive 260ms ease-out;
  }

  .next:active {
    transform: scale(0.98);
  }

  @keyframes arrive {
    from {
      opacity: 0;
    }
  }

  .hint {
    display: none;
    margin: 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 0 4px;
    border: 1px solid var(--paper-sunk);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--paper);
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    text-align: center;
  }

  @media (min-width: 768px) {
    .sheet {
      --tile-w: 96px;
      --tile-h: 112px;
    }
  }

  /* after the tablet rule: a landscape phone is often wider than 768 */
  @media (orientation: landscape) and (max-height: 500px) {
    .sheet {
      --tile-w: 100%;
      --tile-h: 76px;
      padding: max(var(--space-2), env(safe-area-inset-top)) 0 max(var(--space-2), env(safe-area-inset-bottom));
      gap: var(--space-2);
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
      border-radius: 0;
      box-shadow: none;
      transform: translate3d(var(--sink), 0, 0);
    }

    .tray {
      flex: 1;
      min-height: 0;
      display: flex;
      margin: 0 max(var(--space-2), env(safe-area-inset-right)) 0 var(--space-2);
    }

    /* a short column: one line of name, so more tiles fit */
    .well :global(.name) {
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }

    .well {
      flex: 1;
      flex-direction: column;
      overflow-x: hidden;
      overflow-y: auto;
      touch-action: pan-y;
    }

    .put-back-label {
      font-size: 22px;
      writing-mode: vertical-rl;
    }

    .cap,
    .floor {
      margin: 0;
      padding: 0 var(--space-2);
    }

    .floor {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-1);
    }

    .chips {
      flex-direction: column;
      max-height: 100px;
      overflow-x: hidden;
      overflow-y: auto;
      touch-action: pan-y;
    }

    .chip {
      white-space: normal;
      text-align: left;
      line-height: 1.15;
    }

    .stack {
      flex: 1;
      min-height: 0;
    }

    .result {
      --drum-size: 28px;
      --verdict-size: 18px;
      justify-content: flex-start;
      padding: var(--space-2) max(var(--space-2), env(safe-area-inset-right)) 0 var(--space-2);
    }

    .result :global(.readout) {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions {
      flex-direction: column;
      gap: var(--space-2);
      padding: 0 max(var(--space-2), env(safe-area-inset-right)) 0 var(--space-2);
    }

    /* a 132 px column: let the labels wrap and let the fill show progress */
    .actions :global(.hold) {
      width: 100%;
      min-width: 0;
      padding: var(--space-1) var(--space-2);
      white-space: normal;
      line-height: 1.1;
    }

    .actions :global(.hold svg) {
      display: none;
    }

    .next {
      font-size: var(--text-ui);
    }
  }

  @media (min-width: 1024px) and (min-height: 501px) {
    .sheet {
      --tile-w: 100%;
      --tile-h: 112px;
      gap: var(--space-4);
      padding: var(--space-5) var(--space-5) var(--space-4);
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
      border-radius: 0;
      box-shadow: none;
      transform: translate3d(var(--sink), 0, 0);
    }

    .tray {
      flex: 1;
      min-height: 0;
      display: flex;
      margin: 0;
    }

    .well {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-content: start;
      gap: var(--space-2);
      padding: var(--space-3);
      overflow-x: hidden;
      overflow-y: auto;
      touch-action: pan-y;
    }

    .put-back-label {
      font-size: 32px;
    }

    .cap,
    .floor,
    .actions {
      margin: 0;
      padding: 0;
    }

    .floor {
      flex-wrap: wrap;
    }

    .floor-title {
      flex-basis: 100%;
    }

    .chips {
      flex-basis: 100%;
      flex-wrap: wrap;
      max-height: 152px;
      overflow-x: hidden;
      overflow-y: auto;
      touch-action: pan-y;
    }

    .return {
      padding: 0;
    }

    .stack {
      flex: 1;
      min-height: 0;
    }

    .result {
      --drum-size: 64px;
      --verdict-size: 30px;
      justify-content: flex-start;
      padding: var(--space-6) var(--space-2) 0;
    }

    .result :global(.readout) {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .actions {
      flex-direction: column;
    }

    .actions :global(.hold) {
      width: 100%;
    }

    .hint {
      display: block;
    }
  }
</style>
