<script lang="ts">
  import { onMount } from 'svelte';
  import { Sandbox, type CheckResult, type Phase, type Stats } from './sandbox';

  let host: HTMLDivElement;
  let sandbox: Sandbox | undefined;
  let phase = $state<Phase>('loading');
  let stats = $state<Stats>({ fps: 0, stepMs: 0, bodies: 0, inline: false });
  let result = $state<CheckResult | undefined>();
  let error = $state<string | undefined>();

  const busy = $derived(phase !== 'idle');
  const status = $derived(
    phase === 'loading'
      ? 'Loading physics…'
      : phase === 'placing'
        ? 'Stacking the pan…'
        : phase === 'settling'
          ? 'Letting it settle…'
          : phase === 'measuring'
            ? 'Tipping. Measuring…'
            : undefined,
  );

  onMount(() => {
    const s = new Sandbox(host);
    s.onStats = (v) => (stats = v);
    s.onPhase = (v) => (phase = v);
    s.onResult = (v) => (result = v);
    s.onError = (m) => (error = m);
    s.start().catch((e: unknown) => (error = e instanceof Error ? e.message : String(e)));
    sandbox = s;
    return () => s.dispose();
  });

  const fmt = (n: number, digits = 0) => n.toFixed(digits);
</script>

<div class="layout">
  <div class="stage" bind:this={host} role="img" aria-label="A brass balance scale with objects stacked on its right-hand pan">
    <p class="readout" aria-hidden="true">
      <span>{fmt(stats.fps)} fps</span>
      <span>{fmt(stats.stepMs, 1)} ms step</span>
      <span>{stats.bodies} bodies</span>
    </p>
    {#if status}
      <p class="status" role="status">{status}</p>
    {/if}
  </div>

  <section class="panel" aria-labelledby="panel-title">
    <h1 id="panel-title">Physics check</h1>
    <p class="hint">Stacks 80 objects on the right-hand pan, tips the beam and measures the frame rate.</p>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if result}
      <div class="result" class:passed={result.passed} aria-live="polite">
        <p class="verdict">{result.passed ? 'Smooth.' : 'Too slow.'}</p>
        <dl>
          <div><dt>Average</dt><dd>{fmt(result.meanFps)} fps</dd></div>
          <div><dt>Worst 1%</dt><dd>{fmt(result.lowFps)} fps</dd></div>
          <div><dt>Physics step</dt><dd>{fmt(result.stepMs, 1)} ms</dd></div>
          <div><dt>Bodies</dt><dd>{result.bodies}</dd></div>
        </dl>
        {#if stats.inline}<p class="note">Physics ran on the main thread; workers weren't available.</p>{/if}
      </div>
    {/if}

    <div class="actions">
      <div class="secondary">
        <button onclick={() => sandbox?.add(10)} disabled={busy}>Add 10</button>
        <button onclick={() => sandbox?.wobble()} disabled={busy}>Wobble</button>
        <button onclick={() => sandbox?.tip()} disabled={busy}>Tip</button>
        <button onclick={() => sandbox?.clear()} disabled={phase === 'loading'}>Clear</button>
      </div>
      <button class="primary" onclick={() => sandbox?.runCheck()} disabled={busy}>
        {result ? 'Run again' : 'Run check'}
      </button>
    </div>
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100svh;
    overflow: hidden;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .readout {
    position: absolute;
    top: max(var(--space-3), env(safe-area-inset-top));
    right: max(var(--space-4), env(safe-area-inset-right));
    margin: 0;
    display: flex;
    gap: var(--space-3);
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
    pointer-events: none;
  }

  .status {
    position: absolute;
    left: max(var(--space-4), env(safe-area-inset-left));
    bottom: var(--space-4);
    margin: 0;
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 22px;
    color: var(--ink);
    pointer-events: none;
  }

  .panel {
    background: var(--paper-raised);
    border-top: 1px solid var(--paper-sunk);
    border-radius: 20px 20px 0 0;
    padding: var(--space-5) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
    box-shadow: 0 -12px 32px -24px rgb(31 27 23 / 0.35);
  }

  h1 {
    font-size: var(--text-title);
  }

  .hint {
    margin: var(--space-2) 0 0;
    color: var(--ink-soft);
    max-width: 34ch;
  }

  .result {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--brass);
  }

  .verdict {
    margin: 0 0 var(--space-3);
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: 32px;
    line-height: 1;
    color: var(--heavy);
  }

  .passed .verdict {
    color: var(--balanced);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: var(--space-3) var(--space-4);
    margin: 0;
  }

  dt {
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  dd {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .note,
  .error {
    margin: var(--space-3) 0 0;
    font-size: var(--text-small);
    color: var(--ink-soft);
  }

  .error {
    color: var(--heavy);
  }

  .actions {
    margin-top: var(--space-5);
    display: grid;
    gap: var(--space-3);
  }

  .secondary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
  }

  button {
    min-height: var(--target);
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 120ms ease-out,
      background-color 120ms ease-out;
  }

  .secondary button {
    border: 1px solid var(--paper-sunk);
    background: var(--paper);
    color: var(--ink);
  }

  .secondary button:hover:not(:disabled) {
    background: var(--paper-sunk);
  }

  .primary {
    border: 0;
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
  }

  button:active:not(:disabled) {
    transform: scale(0.97);
  }

  button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (orientation: landscape) and (max-height: 500px) {
    .layout {
      grid-template-rows: none;
      grid-template-columns: minmax(0, 1fr) 280px;
    }

    .panel {
      border-radius: 0;
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
      overflow-y: auto;
      padding-top: max(var(--space-4), env(safe-area-inset-top));
    }

    .hint {
      display: none;
    }

    .secondary {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1024px) {
    dl {
      grid-template-columns: repeat(2, 1fr);
    }

    .verdict {
      font-size: 40px;
    }

    .layout {
      grid-template-rows: none;
      grid-template-columns: minmax(0, 1fr) 320px;
    }

    .panel {
      display: flex;
      flex-direction: column;
      border-radius: 0;
      border-top: 0;
      border-left: 1px solid var(--paper-sunk);
      padding: var(--space-6) var(--space-5);
      box-shadow: none;
    }

    .actions {
      margin-top: auto;
    }

    .secondary {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
