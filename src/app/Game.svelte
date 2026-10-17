<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { practiceRound } from '../game/practice';
  import InventorySheet from '../ui/InventorySheet.svelte';
  import { Game, type PlacingState, type Selection } from './game';

  const ROTATE_STEP = Math.PI / 12;
  const round = practiceRound();

  let stage: HTMLDivElement;
  let host: HTMLDivElement;
  let sheet = $state<HTMLElement>();
  let game: Game | undefined;
  let placing = $state<PlacingState>({ ready: false, onPan: {}, panCount: 0, floor: [], full: false, carrying: undefined, putBack: false });
  let thumbs = $state(new Map<string, string>());
  let selection = $state<Selection | null>(null);
  let announcement = $state('');
  let error = $state<string | undefined>();

  const description = $derived.by(() => {
    const things = round.inventory
      .filter((item) => placing.onPan[item.id])
      .map((item) => `${placing.onPan[item.id]} × ${item.name}`);
    const pan = things.length ? `Your pan holds ${things.join(', ')}.` : 'Your pan is empty.';
    return `A balance scale. ${round.prompt.name} sits on the left pan. ${pan}`;
  });

  /** The rotate buttons sit under the selected object, kept inside the scene. */
  const rotatePosition = $derived.by(() => {
    if (!selection || !stage) return undefined;
    const r = stage.getBoundingClientRect();
    const x = Math.min(Math.max(selection.x - r.left, 56), r.width - 56);
    const y = Math.min(Math.max(selection.y - r.top + 12, 8), r.height - 52);
    return { x, y };
  });

  async function announce(message: string): Promise<void> {
    // clear first so the same message twice is still read out
    announcement = '';
    await tick();
    announcement = message;
  }

  onMount(() => {
    const g = new Game(host, () => sheet, round);
    g.onState = (s) => (placing = s);
    g.onAnnounce = (m) => void announce(m);
    g.onSelection = (s) => (selection = s);
    g.onThumbnails = (urls) => (thumbs = urls);
    g.onError = (m) => (error = m);
    g.start().catch((e: unknown) => (error = e instanceof Error ? e.message : String(e)));
    game = g;
    return () => g.dispose();
  });
</script>

<div class="layout" class:carrying={placing.carrying !== undefined}>
  <div class="stage" bind:this={stage}>
    <div class="canvas" bind:this={host} role="img" aria-label={description}></div>

    <h1 class="prompt">{round.prompt.name}</h1>

    {#if error}
      <p class="status error" role="alert">Something slipped. Reload the page to set the scale up again.</p>
    {:else if !placing.ready}
      <p class="status" role="status">Setting up the scale…</p>
    {:else if placing.panCount === 0 && placing.carrying === undefined}
      <p class="status">Drag something onto your pan.</p>
    {/if}

    {#if rotatePosition && placing.carrying === undefined}
      <div class="rotate" style:left="{rotatePosition.x}px" style:top="{rotatePosition.y}px">
        <button type="button" aria-label="Rotate left" onclick={() => game?.rotate(ROTATE_STEP)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M8.5 7.5A7 7 0 1 1 5 13" />
            <path d="M4 5.5v4.2h4.2" />
          </svg>
        </button>
        <button type="button" aria-label="Rotate right" onclick={() => game?.rotate(-ROTATE_STEP)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15.5 7.5A7 7 0 1 0 19 13" />
            <path d="M20 5.5v4.2h-4.2" />
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <InventorySheet
    items={round.inventory}
    {thumbs}
    {placing}
    bind:element={sheet}
    onreset={() => game?.reset()}
    onreturnall={() => game?.returnAll()}
  />

  <div class="visually-hidden" aria-live="polite">{announcement}</div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    /* or the strip's full width of tiles widens the page */
    grid-template-columns: minmax(0, 1fr);
    height: 100svh;
    overflow: hidden;
  }

  .carrying {
    cursor: grabbing;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .canvas {
    position: absolute;
    inset: 0;
  }

  .canvas :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .prompt {
    position: absolute;
    top: max(var(--space-4), env(safe-area-inset-top));
    left: max(var(--space-4), env(safe-area-inset-left));
    max-width: min(16ch, calc(100% - 2 * var(--space-4)));
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: clamp(26px, 3vw + 14px, 44px);
    line-height: 1.02;
    letter-spacing: -0.01em;
    pointer-events: none;
  }

  .status {
    position: absolute;
    left: max(var(--space-4), env(safe-area-inset-left));
    bottom: var(--space-4);
    max-width: calc(100% - 2 * var(--space-4));
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 22px;
    line-height: 1.15;
    color: var(--ink-soft);
    pointer-events: none;
  }

  .error {
    color: var(--heavy);
  }

  .rotate {
    position: absolute;
    display: flex;
    gap: var(--space-3);
    transform: translateX(-50%);
  }

  .rotate button {
    display: grid;
    place-items: center;
    width: var(--target);
    height: var(--target);
    padding: 0;
    border: 1px solid var(--paper-sunk);
    border-radius: 50%;
    background: var(--paper-raised);
    color: var(--ink);
    box-shadow: 0 6px 14px -8px rgb(31 27 23 / 0.45);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 120ms ease-out;
  }

  .rotate button:active {
    transform: scale(0.92);
  }

  .rotate path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .layout {
      grid-template-rows: none;
      grid-template-columns: minmax(0, 1fr) calc(132px + env(safe-area-inset-right));
    }

    .prompt {
      font-size: 24px;
    }

    .status {
      font-size: 18px;
      bottom: max(var(--space-3), env(safe-area-inset-bottom));
    }
  }

  @media (min-width: 1024px) and (min-height: 501px) {
    .layout {
      grid-template-rows: none;
      grid-template-columns: minmax(0, 1fr) 320px;
    }

    .prompt {
      top: var(--space-6);
      left: var(--space-6);
    }

    .status {
      left: var(--space-6);
      bottom: var(--space-6);
      font-size: 26px;
    }
  }
</style>
