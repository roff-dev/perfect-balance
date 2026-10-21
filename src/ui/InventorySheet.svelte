<script lang="ts">
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import type { PlacingState } from '../app/game';
  import { CONFIG } from '../game/config';
  import type { Item } from '../game/round';
  import HoldButton from './HoldButton.svelte';
  import Tile from './Tile.svelte';

  interface Props {
    items: Item[];
    thumbs: Map<string, string>;
    placing: PlacingState;
    onreset: () => void;
    onreturnall: () => void;
    onlockin: () => void;
    /** Sets how many of an item its next drag carries. */
    onbatch: (itemId: string, n: number) => void;
    /** Slid out of the way while the round is weighed and its result shows. */
    away?: boolean;
    /** A freeplay item cap, which replaces the usual "pan's full" limit. */
    cap?: number;
    /** Nothing here can be used: the round won't load, or the physics has failed. */
    unavailable?: boolean;
    element?: HTMLElement;
  }

  let { items, thumbs, placing, onreset, onreturnall, onlockin, onbatch, away = false, cap, unavailable = false, element = $bindable() }: Props = $props();

  // several at once (notes item 11): the tile under the mouse, last tapped or focused shows − and +
  let active = $state<string>();
  const batchOf = (id: string) => (placing.batch.itemId === id ? placing.batch.n : 1);
  const most = $derived(Math.min(CONFIG.maxBatch, placing.room));

  function slotOf(e: Event): string | undefined {
    return e.target instanceof Element ? (e.target.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? undefined) : undefined;
  }

  function over(e: PointerEvent): void {
    if (e.pointerType === 'mouse') active = slotOf(e);
  }

  function leave(e: PointerEvent): void {
    if (e.pointerType === 'mouse') active = undefined;
  }

  // touch has no hover, so a tap picks the tile and it stays picked until another is
  function press(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') active = slotOf(e) ?? active;
  }

  /** + and − on a focused tile, so the keyboard needs no extra stops. */
  function key(e: KeyboardEvent): void {
    const tile = e.target instanceof HTMLElement && e.target.matches('[data-item]:not([data-source])') ? e.target : null;
    if (!tile || e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.key === '+' || e.key === '=' ? 1 : e.key === '-' || e.key === '_' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const id = tile.dataset.item!;
    onbatch(id, batchOf(id) + step);
  }

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
  class:unavailable
  class:away
  inert={unavailable || away}
  bind:this={element}
  aria-label="Things to weigh"
  style:--sink="{sink.current}px"
>
  <div class="tray">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="well"
      data-strip
      onpointerover={over}
      onpointerleave={leave}
      onpointerdown={press}
      onfocusin={(e) => (active = slotOf(e))}
      onkeydown={key}
    >
      {#each items as item (item.id)}
        {@const n = batchOf(item.id)}
        {@const stepping = placingPhase && !placing.full && (active === item.id || n > 1)}
        <div class="slot" data-slot={item.id}>
          <Tile
            {item}
            thumb={thumbs.get(item.id)}
            count={placing.onPan[item.id] ?? 0}
            batch={n}
            covered={stepping}
            full={placing.full || !placingPhase}
            held={placing.carrying === item.id}
          />
          {#if stepping}
            <!-- pointer only: a focused tile takes + and − from the keyboard -->
            <div class="stepper" class:set={n > 1}>
              <button type="button" tabindex="-1" aria-label="One fewer {item.name}" disabled={n <= 1} onclick={() => onbatch(item.id, n - 1)}>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 6h8" /></svg>
              </button>
              <span class="n" aria-hidden="true">×{n}</span>
              <button type="button" tabindex="-1" aria-label="One more {item.name}" disabled={n >= most} onclick={() => onbatch(item.id, n + 1)}>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 6h8M6 2v8" /></svg>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <p class="put-back-label" aria-hidden="true">Put back</p>
  </div>

  {#if placing.full && placingPhase}
    <p class="cap">{cap ? `That's ${cap}, the most this game allows.` : "That's plenty — the pan's full."}</p>
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
        disabled={!placingPhase || !placing.ready || placing.pouring}
      />
    </div>
  </div>

  {#if placingPhase}
    <p class="hint">
      Hold something and press <kbd>Q</kbd> or <kbd>E</kbd>, or use the wheel, to turn it. Press <kbd>V</kbd> to switch view.
    </p>
  {/if}
</section>

<style>
  /* a round that wouldn't load leaves Retry as the only thing to do */
  .unavailable > * {
    opacity: 0.4;
    filter: grayscale(1);
  }

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
    transition: translate 380ms cubic-bezier(0.5, 0, 0.2, 1);
  }

  /* while a round is weighed the scale has the whole screen; the sheet keeps its place in the layout */
  .away {
    translate: 0 calc(100% + 32px);
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet {
      transition-duration: 150ms;
    }
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

  .slot {
    position: relative;
    flex: none;
  }
  /* sits over the foot of the tile, where its name is; the status line names it meanwhile */
  .stepper {
    position: absolute;
    right: 3px;
    bottom: 3px;
    left: 3px;
    display: grid;
    grid-template-columns: 26px 1fr 26px;
    align-items: center;
    height: 26px;
    border-radius: var(--radius-control);
    background: var(--paper);
    box-shadow:
      0 1px 0 rgb(31 27 23 / 0.08),
      inset 0 0 0 1px rgb(122 86 23 / 0.35);
    animation: step-in 140ms ease-out;
  }

  /* a count above one stays on show, in brass, until it's used */
  .stepper.set {
    background: color-mix(in srgb, var(--brass) 18%, var(--paper));
  }

  .stepper button {
    display: grid;
    place-items: center;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-control);
    background: none;
    color: var(--ink);
    cursor: pointer;
    touch-action: manipulation;
  }

  .stepper button:disabled {
    color: rgb(31 27 23 / 0.25);
    cursor: default;
  }

  @media (hover: hover) {
    .stepper button:not(:disabled):hover {
      background: rgb(122 86 23 / 0.14);
    }
  }

  .stepper path {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  .stepper .n {
    font-size: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--brass-ink);
  }

  @keyframes step-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
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
      --tile-h: 88px;
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

    .away {
      translate: calc(100% + 32px) 0;
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

    .away {
      translate: calc(100% + 32px) 0;
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
