<script lang="ts">
  import { CONFIG } from '../game/config';

  interface Props {
    label: string;
    /** Accessible name, which should say it needs holding. */
    name: string;
    onconfirm: () => void;
    /** Shown while it's held, if the label should change. */
    holdingLabel?: string;
    primary?: boolean;
    holdMs?: number;
    disabled?: boolean;
  }

  let { label, name, onconfirm, holdingLabel, primary = false, holdMs = CONFIG.holdToConfirmMs, disabled = false }: Props = $props();

  const RADIUS = 7;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  let button: HTMLButtonElement;
  let progress = $state(0);
  let holding = $state(false);
  let startedAt = 0;
  let frame = 0;
  let lastEnter = 0;

  function begin(): void {
    if (disabled || holding) return;
    holding = true;
    startedAt = performance.now();
    frame = requestAnimationFrame(step);
  }

  function step(now: number): void {
    progress = Math.min(1, (now - startedAt) / holdMs);
    if (progress >= 1) finish(true);
    else frame = requestAnimationFrame(step);
  }

  function finish(confirmed: boolean): void {
    cancelAnimationFrame(frame);
    holding = false;
    progress = 0;
    if (confirmed) {
      lastEnter = 0;
      onconfirm();
    }
  }

  function stop(): void {
    if (holding) finish(false);
  }

  function pointerdown(e: PointerEvent): void {
    if (e.button !== 0) return;
    button.setPointerCapture(e.pointerId);
    begin();
  }

  function pointermove(e: PointerEvent): void {
    if (!holding) return;
    const r = button.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) stop();
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.repeat) return;
    // two quick presses also confirm, for anyone who can't hold a key
    if (e.key === 'Enter') {
      const now = performance.now();
      if (now - lastEnter < 2000) return finish(true);
      lastEnter = now;
    }
    begin();
  }

  function keyup(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') stop();
  }
</script>

<button
  bind:this={button}
  type="button"
  class="hold"
  class:holding
  class:primary
  aria-label={name}
  aria-disabled={disabled}
  style:--progress={progress}
  onpointerdown={pointerdown}
  onpointermove={pointermove}
  onpointerup={stop}
  onpointercancel={stop}
  onlostpointercapture={stop}
  onkeydown={keydown}
  onkeyup={keyup}
  onblur={stop}
  oncontextmenu={(e) => e.preventDefault()}
>
  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    <circle class="track" cx="9" cy="9" r={RADIUS} />
    <circle
      class="fill"
      cx="9"
      cy="9"
      r={RADIUS}
      stroke-dasharray={CIRCUMFERENCE}
      stroke-dashoffset={CIRCUMFERENCE * (1 - progress)}
    />
  </svg>
  <span>{holding && holdingLabel ? holdingLabel : label}</span>
</button>

<style>
  .hold {
    position: relative;
    isolation: isolate;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--target);
    padding: 0 var(--space-4);
    border: 1.5px solid var(--ink-soft);
    border-radius: var(--radius-control);
    background: var(--paper-raised);
    color: var(--ink);
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
  }

  /* the pill fills from the left while it's held */
  .hold::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--paper-sunk);
    transform: scaleX(var(--progress));
    transform-origin: left;
  }

  .hold:hover:not([aria-disabled='true']) {
    border-color: var(--ink);
  }

  .hold[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }

  svg {
    flex: none;
    transform: rotate(-90deg);
  }

  circle {
    fill: none;
    stroke-width: 2;
  }

  .track {
    stroke: var(--paper-sunk);
  }

  .fill {
    stroke: var(--ink);
    stroke-linecap: round;
  }

  .primary {
    border-color: var(--enamel);
    background: var(--enamel);
    color: var(--on-enamel);
  }

  .primary::before {
    background: rgb(248 244 236 / 0.2);
  }

  .primary:hover:not([aria-disabled='true']) {
    border-color: var(--enamel);
  }

  .primary .track {
    stroke: rgb(248 244 236 / 0.3);
  }

  .primary .fill {
    stroke: var(--on-enamel);
  }

  /* a round cap would leave a dot at zero */
  .hold:not(.holding) .fill {
    opacity: 0;
  }
</style>
