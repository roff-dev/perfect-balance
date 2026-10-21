<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { Calculator, type Key } from '../game/calculator';
  import { judge, type Result } from '../game/judge';
  import type { RoundSupply } from '../game/freeplay';
  import InventorySheet from '../ui/InventorySheet.svelte';
  import Slip from '../ui/Slip.svelte';
  import Ticket from '../ui/Ticket.svelte';
  import VerdictGlyph from '../ui/VerdictGlyph.svelte';
  import { DAILY_LIMITS, Game, type Limits, type PlacingState, type Selection, type View } from './game';
  import Leave from './Leave.svelte';

  interface Props {
    rounds: RoundSupply;
    limits?: Limits;
    /** Freeplay rules in a few words, shown under the prompt. */
    rules?: string;
    /** Rounds already played, when a game is resumed. */
    played?: Result[];
    onresult?: (results: Result[]) => void;
    /** After the physics has failed: starts the game again from the round it was on. */
    onrestart?: (results: Result[]) => void;
    /** The scene couldn't start, though the browser said it could draw 3D. */
    onunsupported?: () => void;
    onfinish: (results: Result[]) => void;
    /** Leaves a numbered puzzle to finish later; without it, the only way out is to give up. */
    onleave?: () => void;
    /** Today's puzzle, so giving up still counts for the streak. */
    daily?: boolean;
  }

  let { rounds, limits = DAILY_LIMITS, rules = '', played = [], onresult, onrestart, onunsupported, onfinish, onleave, daily = false }: Props = $props();

  const ROTATE_STEP = Math.PI / 12;
  // a new game mounts a new screen, so only the first value matters
  const resumed = untrack(() => [...played]);

  let layout: HTMLElement;
  let stage: HTMLDivElement;
  let host: HTMLDivElement;
  let top: HTMLElement;
  let toggle: HTMLElement;
  let foot: HTMLElement;
  let view = $state<View>('overview');
  let sheet = $state<HTMLElement>();
  let game: Game | undefined;
  let placing = $state<PlacingState>({ ready: false, round: resumed.length, onPan: {}, panCount: 0, floor: [], full: false, carrying: undefined, putBack: false, phase: 'intro', result: undefined, missing: [], opening: resumed.length, failed: false, progress: 0 });
  let results = $state<Result[]>([...resumed]);
  const round = $derived(rounds.at(placing.round));
  // an object that wouldn't load is left out of the round
  const inventory = $derived(round.inventory.filter((item) => !placing.missing.includes(item.id)));
  const endless = $derived(rounds.count === Infinity);
  // an endless game ends at the first miss
  const last = $derived(endless ? placing.result !== undefined && placing.result.verdict !== 'balanced' : placing.round === rounds.count - 1);
  let thumbs = $state(new Map<string, string>());
  let selection = $state<Selection | null>(null);
  let announcement = $state('');
  let error = $state<string | undefined>();

  // the notes slip (§3.12): kept while it's closed, cleared by the next round
  let notesButton = $state<HTMLButtonElement>();
  let slipOpen = $state(false);
  let notes = $state('');
  const calculator = new Calculator();
  let calculation = $state(calculator.display);
  let notesRound = untrack(() => placing.round);

  function press(key: Key): void {
    calculator.press(key);
    calculation = calculator.display;
  }

  function closeSlip(): void {
    slipOpen = false;
    notesButton?.focus();
  }

  $effect(() => {
    if (placing.round === notesRound) return;
    notesRound = placing.round;
    notes = '';
    calculator.reset();
    calculation = calculator.display;
  });

  const description = $derived.by(() => {
    const things = inventory
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

  // the panel slides away while a round is weighed and its result shows (notes item 5)
  const away = $derived((placing.phase === 'locking' || placing.phase === 'revealing' || placing.phase === 'result') && !error);
  let ticket = $state<ReturnType<typeof Ticket>>();
  /** The part of the screen the scale is framed in, from each edge: the ticket is centred there too. */
  let clear = $state({ top: 0, right: 0, bottom: 0, left: 0 });

  /**
   * Keeps the framed scale clear of the prompt, the View button, the status line and the panels.
   * The canvas fills the screen, so while the panel is away the scale can grow into its space.
   */
  function measure(animate = false): void {
    // never while something's held: the floor row comes and goes mid-drag, and the pan mustn't move under the finger
    if (placing.carrying !== undefined) {
      remeasure = true;
      return;
    }
    const l = layout.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const free = away && !slipOpen;
    const beside = !!sheet && sheet.offsetLeft > stage.offsetLeft;
    const right = free && beside ? l.right : s.right;
    const bottom = free && !beside ? l.bottom - 16 : foot.getBoundingClientRect().top;
    const above = Math.max(top.getBoundingClientRect().bottom, toggle.getBoundingClientRect().bottom);
    clear = { top: above - l.top, right: l.right - right, bottom: l.bottom - (free && !beside ? l.bottom : s.bottom), left: s.left - l.left };
    game?.setInsets({ top: above - l.top + 8, right: l.right - right + 12, bottom: l.bottom - bottom + 4, left: s.left - l.left + 12 }, animate);
  }

  let remeasure = false;

  $effect(() => {
    void away;
    untrack(() => game && measure(true));
  });

  $effect(() => {
    if (placing.carrying !== undefined || !remeasure) return;
    remeasure = false;
    untrack(() => measure(true));
  });

  /** A tap or a key during the reveal hurries it along: first the beam, then the ticket. */
  function hurry(e: Event): void {
    if (e instanceof KeyboardEvent && (e.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key))) return;
    if (placing.phase === 'locking' || placing.phase === 'revealing') game?.hurry();
    else if (placing.phase === 'result') ticket?.finish();
  }

  // giving up (§16): the rounds not played score as empty pans
  let leaving = $state(false);
  let givingUp = false;

  function giveUp(): void {
    // a round that's already locked in keeps its result
    if (placing.phase === 'locking' || placing.phase === 'revealing') givingUp = true;
    else finishEarly();
  }

  function finishEarly(): void {
    const played = $state.snapshot(results) as Result[];
    const empty = judge([], 1, limits.margin);
    // an endless game is over at its first miss, so only the round it's on is lost
    if (endless) {
      if (played.at(-1)?.verdict !== 'light' && played.at(-1)?.verdict !== 'heavy') played.push(empty);
    } else {
      while (played.length < rounds.count) played.push({ ...empty });
    }
    results = played;
    onresult?.(played);
    onfinish(played);
  }

  // tile names get cut short, so the one under the pointer, focused or held shows in full in the status line
  const NAME_LINGER_MS = 2500;
  let pointed = $state<string>();
  let lingering: ReturnType<typeof setTimeout> | undefined;
  const named = $derived.by(() => {
    const id = placing.carrying ?? pointed;
    return id && placing.phase === 'placing' ? inventory.find((item) => item.id === id)?.name : undefined;
  });

  const tileItem = (e: Event) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-item]')?.dataset.item : undefined);

  function point(e: Event): void {
    const id = tileItem(e);
    // a tap focuses the tile too, but only keyboard focus should keep the name up
    if (!id || (e.type === 'focusin' && !(e.target as Element).matches(':focus-visible'))) return;
    clearTimeout(lingering);
    pointed = id;
  }

  /** A finger lifts as soon as it taps, so the name stays a moment longer. */
  function unpoint(e: Event): void {
    if (!tileItem(e)) return;
    clearTimeout(lingering);
    if (e instanceof PointerEvent && e.pointerType === 'touch') lingering = setTimeout(() => (pointed = undefined), NAME_LINGER_MS);
    else pointed = undefined;
  }

  $effect(() => {
    void placing.round;
    untrack(() => {
      clearTimeout(lingering);
      pointed = undefined;
    });
  });

  function keydown(e: KeyboardEvent): void {
    if (e.key.toLowerCase() !== 'v' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    game?.toggleView();
  }

  onMount(() => {
    let g: Game;
    try {
      g = new Game(host, () => sheet, rounds, resumed.length, limits);
    } catch {
      onunsupported?.();
      return;
    }
    g.onView = (v) => (view = v);
    g.onState = (s) => (placing = s);
    g.onAnnounce = (m) => void announce(m);
    g.onSelection = (s) => (selection = s);
    g.onThumbnails = (urls) => (thumbs = urls);
    g.onError = (m) => (error = m);
    g.onResult = (i, r) => {
      results[i] = r;
      onresult?.($state.snapshot(results));
      if (givingUp) finishEarly();
    };
    g.start().catch((e: unknown) => (error = e instanceof Error ? e.message : String(e)));
    game = g;
    measure();
    // eased, as a resized canvas was before it filled the screen
    const observer = new ResizeObserver(() => measure(true));
    observer.observe(stage);
    observer.observe(top);
    void document.fonts.ready.then(() => measure());
    return () => {
      observer.disconnect();
      g.dispose();
    };
  });
</script>

<svelte:window onkeydown={keydown} onkeydowncapture={hurry} onpointerdowncapture={hurry} />

<main
  bind:this={layout}
  class="layout"
  class:carrying={placing.carrying !== undefined}
  class:slip-open={slipOpen}
  onpointerover={point}
  onpointerout={unpoint}
  onfocusin={point}
  onfocusout={unpoint}
  style:--clear-top="{clear.top}px"
  style:--clear-right="{clear.right}px"
  style:--clear-bottom="{clear.bottom}px"
  style:--clear-left="{clear.left}px"
>
  <div class="stage" bind:this={stage}>
    <div class="canvas" bind:this={host} role="img" aria-label={description}></div>

    <header class="top" bind:this={top}>
      <div class="bar">
        <button type="button" class="mark" aria-label="Leave this game" aria-haspopup="dialog" onclick={() => (leaving = true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 4v15M7 20h10M4 7h16M6 7l-3 7h6zM18 7l-3 7h6z" /></svg>
        </button>
        <p class="rounds">
          {#if endless}
            <span class="count">Round {placing.round + 1}</span>
          {:else}
            <span class="visually-hidden">Round {placing.round + 1} of {rounds.count}</span>
            {#each { length: rounds.count }, i (i)}
              {#if results[i]}
                <span class="dot {results[i].verdict}"><VerdictGlyph verdict={results[i].verdict} /></span>
              {:else}
                <span class="dot" class:current={i === placing.round} aria-hidden="true"></span>
              {/if}
            {/each}
          {/if}
        </p>
      </div>
      <!-- a round that won't load is named, rather than the one before it -->
      {#key placing.failed ? placing.opening : placing.round}
        <h1 class="prompt">{rounds.at(placing.failed ? placing.opening : placing.round).prompt.name}</h1>
      {/key}
      {#if rules}
        <p class="rules">{rules}</p>
      {/if}
    </header>

    <div class="tools" bind:this={toggle}>
    <button
      type="button"
      class="pill view"
      aria-label={view === 'overview' ? 'Close-up of your pan' : 'Whole scale'}
      onclick={() => game?.toggleView()}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        {#if view === 'overview'}
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
          <circle cx="10" cy="10" r="2.2" />
        {:else}
          <path d="M7 3v4H3M17 7h-4V3M13 17v-4h4M3 13h4v4" />
        {/if}
      </svg>
      <span aria-hidden="true">{view === 'overview' ? 'Close up' : 'Whole scale'}</span>
    </button>
    <button
      type="button"
      class="pill notes"
      bind:this={notesButton}
      aria-label="Notes and calculator"
      aria-expanded={slipOpen}
      aria-controls="slip"
      onclick={() => (slipOpen ? closeSlip() : (slipOpen = true))}
    >
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <path d="M13.5 3.5l3 3-9 9H4.5v-3z" />
        <path d="M11.5 5.5l3 3" />
      </svg>
      <span aria-hidden="true">Notes</span>
    </button>
    </div>

    <div class="foot" bind:this={foot}>
      {#if error}
        <div class="retry" role="alert">
          <p class="status">Something slipped. Restart this round?</p>
          <button type="button" onclick={() => onrestart?.($state.snapshot(results))}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15.5 7.5A7 7 0 1 0 19 13" />
              <path d="M20 5.5v4.2h-4.2" />
            </svg>
            Restart
          </button>
        </div>
      {:else if placing.failed}
        <div class="retry" role="alert">
          <p class="status">Couldn't load this round — try again</p>
          <button type="button" onclick={() => game?.retry()}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M15.5 7.5A7 7 0 1 0 19 13" />
              <path d="M20 5.5v4.2h-4.2" />
            </svg>
            Retry
          </button>
        </div>
      {:else if !placing.ready}
        <p class="status" id="setting-up" role="status">Setting up the scale…</p>
        <div class="meter" role="progressbar" aria-labelledby="setting-up" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(placing.progress * 100)}>
          <span style:transform="scaleX({placing.progress})"></span>
        </div>
      {:else if placing.phase === 'loading'}
        <p class="status" role="status">Loading the round…</p>
      {:else if placing.phase === 'placing' && placing.panCount === 0 && placing.carrying === undefined}
        <!-- kept in place under a name, so the line's height doesn't change -->
        <p class="status" class:covered={named}>Drag something onto your pan.</p>
      {/if}
      {#if named && !error && !placing.failed}
        <!-- the tile's own name already says it to screen readers -->
        <p class="status name" aria-hidden="true">{named}</p>
      {/if}
    </div>

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

  {#if slipOpen}
    <Slip bind:notes display={calculation} onpress={press} onclose={closeSlip} />
  {/if}

  <InventorySheet
    items={inventory}
    {thumbs}
    {placing}
    bind:element={sheet}
    onreset={() => game?.reset()}
    onreturnall={() => game?.returnAll()}
    onlockin={() => game?.lockIn()}
    {away}
    unavailable={placing.failed || error !== undefined}
    cap={limits.maxBodies < DAILY_LIMITS.maxBodies ? limits.maxBodies : undefined}
  />

  {#if placing.result && !error}
    <Ticket bind:this={ticket} result={placing.result} {last} onnext={() => (last ? onfinish(results) : game?.nextRound())} />
  {/if}

  <div class="visually-hidden" aria-live="polite">{announcement}</div>
</main>

{#if leaving}
  <Leave
    resume={onleave ? results.length + 1 : undefined}
    {endless}
    {daily}
    onlater={() => onleave?.()}
    ongiveup={giveUp}
    onclose={() => (leaving = false)}
  />
{/if}

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

  /* the whole screen, under the panels, so the scale can use the panel's space when it's away */
  .canvas {
    position: fixed;
    inset: 0;
  }

  /* positioned, so it stays above the canvas */
  .layout > :global(.slip) {
    position: relative;
    z-index: 1;
  }

  .canvas :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .top {
    position: absolute;
    top: max(var(--space-4), env(safe-area-inset-top));
    left: max(var(--space-4), env(safe-area-inset-left));
    /* leaves room for the View button */
    max-width: min(26rem, calc(100% - 2 * var(--space-4) - 150px));
    pointer-events: none;
  }

  /* the mark's 44 px target overlaps the space around the dots, so the prompt stays where it was */
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: -15px 0 calc(var(--space-2) - 15px) -11px;
  }

  .mark {
    display: grid;
    place-items: center;
    width: var(--target);
    height: var(--target);
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
  }

  .mark:hover {
    background: rgb(184 137 47 / 0.14);
  }

  .mark path {
    fill: none;
    stroke: var(--brass-ink);
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rounds {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 14px;
    margin: 0;
  }

  .count {
    font-size: var(--text-small);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }

  .rules {
    margin: var(--space-1) 0 0;
    color: var(--brass-ink);
    font-size: var(--text-small);
    font-weight: 600;
    text-shadow:
      0 0 2px var(--paper),
      0 0 10px var(--paper);
  }

  .dot {
    display: grid;
    place-items: center;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--ink-soft);
    border-radius: 50%;
    font-size: 14px;
  }

  .dot.current {
    background: var(--ink);
    border-color: var(--ink);
  }

  /* a finished round shows its verdict glyph instead */
  .dot.balanced,
  .dot.heavy,
  .dot.light {
    width: 14px;
    border: 0;
    border-radius: 0;
  }

  .dot.balanced {
    color: var(--balanced);
  }

  .dot.heavy {
    color: var(--heavy);
  }

  .dot.light {
    color: var(--light);
  }

  .prompt {
    max-width: 16ch;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    /* the tight lines are shorter than the face, so the clamp's clip took the tails off g, y and p (notes item 9):
       room for them below, given back so nothing moves */
    padding-bottom: 0.16em;
    margin-bottom: -0.16em;
    font-size: clamp(26px, 3vw + 14px, 44px);
    line-height: 1.02;
    letter-spacing: -0.01em;
    animation: arrive 400ms ease-out;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-0.15em);
    }
  }

  /* only shows where the scale passes behind the text */
  .prompt,
  .status {
    text-shadow:
      0 0 2px var(--paper),
      0 0 10px var(--paper),
      0 0 18px var(--paper);
  }

  .tools {
    position: absolute;
    top: max(var(--space-4), env(safe-area-inset-top));
    right: max(var(--space-4), env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target);
    padding: 0 var(--space-4) 0 var(--space-3);
    border: 1px solid var(--paper-sunk);
    border-radius: var(--radius-control);
    background: var(--paper-raised);
    color: var(--ink);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 6px 14px -10px rgb(31 27 23 / 0.45);
  }

  .pill:hover {
    border-color: var(--ink-soft);
  }

  /* an icon on its own until there's room for the word */
  .notes {
    justify-content: center;
    width: var(--target);
    padding: 0;
  }

  .notes span {
    display: none;
  }

  .notes[aria-expanded='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper-raised);
  }

  /* on phones the slip takes the inventory's place while it's open */
  .slip-open > :global(.sheet) {
    display: none;
  }

  .pill path,
  .pill circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* always there, so the framing can keep clear of the line whether or not it shows */
  .foot {
    position: absolute;
    left: max(var(--space-4), env(safe-area-inset-left));
    right: max(var(--space-4), env(safe-area-inset-right));
    bottom: var(--space-4);
    min-height: calc(22px * 1.15);
    pointer-events: none;
  }

  .status {
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 22px;
    line-height: 1.15;
    color: var(--ink-soft);
    pointer-events: none;
  }

  .covered {
    visibility: hidden;
  }

  /* pinned to the bottom of the line, so a long name grows upwards and the framing doesn't move */
  .name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    color: var(--ink);
    animation: arrive 160ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .name {
      animation: none;
    }
  }

  /* real bytes: the physics engine and the first round's models */
  .meter {
    width: min(12rem, 60%);
    height: 3px;
    margin-top: var(--space-2);
    border-radius: 2px;
    background: var(--paper-sunk);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: var(--brass-ink);
    transform-origin: left;
    transition: transform 160ms linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }
  }

  .retry {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .retry .status {
    color: var(--ink);
  }

  .retry button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target);
    padding: 0 var(--space-4) 0 var(--space-3);
    border: 1px solid var(--paper-sunk);
    border-radius: var(--radius-control);
    background: var(--paper-raised);
    color: var(--ink);
    font-weight: 600;
    cursor: pointer;
    pointer-events: auto;
    touch-action: manipulation;
    box-shadow: 0 6px 14px -10px rgb(31 27 23 / 0.45);
  }

  .retry button:hover {
    border-color: var(--ink-soft);
  }

  .retry path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
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

    .top,
    .tools {
      top: max(var(--space-3), env(safe-area-inset-top));
    }

    .slip-open {
      grid-template-columns: minmax(0, 1fr) calc(220px + env(safe-area-inset-right));
    }

    /* the bar sits nearer the top here, so the target stays on screen */
    .bar {
      margin-top: calc(-1 * var(--space-3));
      margin-bottom: calc(var(--space-1) - 15px);
    }

    .foot {
      bottom: max(var(--space-3), env(safe-area-inset-bottom));
      min-height: calc(18px * 1.15);
    }

    .status {
      font-size: 18px;
    }
  }

  @media (min-width: 1024px) and (min-height: 501px) {
    .layout {
      grid-template-rows: none;
      grid-template-columns: minmax(0, 1fr) 320px;
    }

    .top {
      top: var(--space-6);
      left: var(--space-6);
    }

    .tools {
      top: var(--space-6);
      right: var(--space-6);
    }

    .notes {
      width: auto;
      padding: 0 var(--space-4) 0 var(--space-3);
    }

    .notes span {
      display: inline;
    }

    .slip-open {
      grid-template-columns: minmax(0, 1fr) 280px 320px;
    }

    .slip-open > :global(.sheet) {
      display: flex;
    }

    .foot {
      left: var(--space-6);
      bottom: var(--space-6);
      min-height: calc(26px * 1.15);
    }

    .status {
      font-size: 26px;
    }
  }
</style>
