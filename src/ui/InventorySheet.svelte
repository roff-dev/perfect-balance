<script lang="ts">
  import { Spring, prefersReducedMotion } from 'svelte/motion';
  import type { PlacingState } from '../app/game';
  import type { Item } from '../game/practice';
  import HoldButton from './HoldButton.svelte';
  import Tile from './Tile.svelte';

  interface Props {
    items: Item[];
    thumbs: Map<string, string>;
    placing: PlacingState;
    onreset: () => void;
    onreturnall: () => void;
    element?: HTMLElement;
  }

  let { items, thumbs, placing, onreset, onreturnall, element = $bindable() }: Props = $props();

  const sink = new Spring(0, { stiffness: 0.2, damping: 0.55 });
  $effect(() => {
    sink.set(placing.putBack ? 6 : 0, { instant: prefersReducedMotion.current });
  });

  const floorCount = $derived(placing.floor.reduce((n, f) => n + f.count, 0));
</script>

<section
  class="sheet"
  class:put-back={placing.putBack}
  class:carrying={placing.carrying !== undefined}
  bind:this={element}
  aria-label="Things to weigh"
  style:--sink="{sink.current}px"
>
  <div class="tray">
    <div class="well" data-strip>
      {#each items as item (item.id)}
        <Tile
          {item}
          thumb={thumbs.get(item.id)}
          count={placing.onPan[item.id] ?? 0}
          full={placing.full}
          held={placing.carrying === item.id}
        />
      {/each}
    </div>
    <p class="put-back-label" aria-hidden="true">Put back</p>
  </div>

  {#if placing.full}
    <p class="cap">That's plenty — the pan's full.</p>
  {/if}

  {#if floorCount > 0}
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
    <HoldButton label="Reset" name="Reset pan, hold to confirm" onconfirm={onreset} disabled={placing.panCount === 0} />
  </div>

  <p class="hint">
    Hold something and press <kbd>Q</kbd> or <kbd>E</kbd>, or use the wheel, to turn it.
  </p>
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
      --tile-h: 92px;
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
      padding: 0 max(var(--space-2), env(safe-area-inset-right)) 0 var(--space-2);
    }

    .actions :global(.hold) {
      width: 100%;
      min-width: 0;
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

    .actions :global(.hold) {
      width: 100%;
    }

    .hint {
      display: block;
    }
  }
</style>
