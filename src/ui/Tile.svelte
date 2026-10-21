<script lang="ts">
  import type { Item } from '../game/round';

  interface Props {
    item: Item;
    thumb: string | undefined;
    count: number;
    /** How many its next drag carries. */
    batch?: number;
    /** The − / + stepper sits over its foot, so the name steps aside. */
    covered?: boolean;
    full: boolean;
    held: boolean;
  }

  let { item, thumb, count, batch = 1, covered = false, full, held }: Props = $props();

  const label = $derived(
    [item.name, count > 0 && `${count} on your pan`, batch > 1 && `${batch} at a time`].filter(Boolean).join(', '),
  );
</script>

<button type="button" class="tile" class:held data-item={item.id} aria-label={label} aria-disabled={full}>
  <span class="thumb" aria-hidden="true">
    {#if thumb}
      <img src={thumb} alt="" draggable="false" />
    {:else}
      <span class="swatch" style:background={item.color}></span>
    {/if}
  </span>
  <span class="name" class:covered aria-hidden="true">{item.name}</span>
  {#if count > 0}
    <span class="count" aria-hidden="true">×{count}</span>
  {/if}
</button>

<style>
  .tile {
    position: relative;
    flex: none;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    gap: 2px;
    width: var(--tile-w);
    height: var(--tile-h);
    padding: var(--space-1) var(--space-1) 6px;
    border: 0;
    border-radius: var(--radius-tile);
    background: var(--paper-raised);
    box-shadow:
      0 1px 0 rgb(31 27 23 / 0.08),
      inset 0 0 0 1px rgb(31 27 23 / 0.04);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    transition:
      transform 160ms ease-out,
      opacity 160ms ease-out;
  }

  .tile:hover:not([aria-disabled='true']) .thumb {
    transform: translateY(-2px);
  }

  .tile:active:not([aria-disabled='true']) {
    cursor: grabbing;
  }

  .tile[aria-disabled='true'] {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .thumb {
    position: relative;
    width: 100%;
    min-height: 0;
    transition:
      transform 200ms ease-out,
      opacity 200ms ease-out;
  }

  img,
  .swatch {
    position: absolute;
    inset: 0;
    margin: auto;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .swatch {
    width: 55%;
    aspect-ratio: 1;
    border-radius: 8px;
  }

  /* the copy you lifted leaves an empty socket behind */
  .held .thumb {
    opacity: 0.3;
    transform: scale(0.86);
  }

  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    max-width: 100%;
    font-size: var(--text-small);
    hyphens: auto;
    line-height: 1.15;
    text-align: center;
    color: var(--ink);
  }

  /* a two-line name would peek out above the stepper */
  .name.covered {
    visibility: hidden;
  }

  .count {
    position: absolute;
    top: 5px;
    right: 5px;
    min-width: 22px;
    padding: 1px 6px;
    border-radius: var(--radius-control);
    background: var(--paper);
    box-shadow: inset 0 0 0 1px rgb(122 86 23 / 0.35);
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    font-variant-numeric: tabular-nums;
    color: var(--brass-ink);
  }
</style>
