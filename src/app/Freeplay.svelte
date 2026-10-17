<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { THEME_NAMES, type Theme } from '../data/catalogue';
  import { CAP_CHOICES, ROUND_CHOICES, type FreeplaySettings } from '../game/freeplay';

  interface Props {
    settings: FreeplaySettings;
    onstart: (settings: FreeplaySettings) => void;
    onclose: () => void;
  }

  let { settings, onstart, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  // edited here, and only kept if the game starts
  let draft = $state(untrack(() => ({ ...settings, cap: settings.cap || CAP_CHOICES[1] })));
  let capOn = $state(untrack(() => settings.cap > 0));
  const themes = Object.entries(THEME_NAMES) as [Theme, string][];

  onMount(() => dialog.showModal());

  function start(e: SubmitEvent): void {
    e.preventDefault();
    onstart({ ...draft, cap: capOn ? draft.cap : 0 });
    dialog.close();
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="freeplay-title">
  <form class="sheet" onsubmit={start}>
    <header>
      <h2 id="freeplay-title">Freeplay</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <p class="lede">Random rounds, your rules. Nothing here touches your streak.</p>

    <fieldset class="row" disabled={draft.endless}>
      <legend>Rounds</legend>
      <div class="segments">
        {#each ROUND_CHOICES as n (n)}
          <label><input type="radio" name="rounds" value={n} bind:group={draft.rounds} /><span>{n}</span></label>
        {/each}
      </div>
    </fieldset>

    <label class="switch">
      <span class="text"><strong>Endless</strong><span>Keep going until you miss one.</span></span>
      <input type="checkbox" role="switch" bind:checked={draft.endless} />
    </label>

    <label class="switch">
      <span class="text"><strong>Precision</strong><span>Only within 1% either way counts as balanced.</span></span>
      <input type="checkbox" role="switch" bind:checked={draft.precision} />
    </label>

    <div class="group">
      <label class="switch">
        <span class="text"><strong>Item cap</strong><span>Use only a few things at once.</span></span>
        <input type="checkbox" role="switch" bind:checked={capOn} />
      </label>
      {#if capOn}
        <fieldset class="row inset">
          <legend class="visually-hidden">Most things at once</legend>
          <div class="segments">
            {#each CAP_CHOICES as n (n)}
              <label><input type="radio" name="cap" value={n} bind:group={draft.cap} /><span>At most {n}</span></label>
            {/each}
          </div>
        </fieldset>
      {/if}
    </div>

    <label class="switch">
      <span class="text"><strong>Target weight</strong><span>Match a brass weight, like 2 kg, instead of an object.</span></span>
      <input type="checkbox" role="switch" bind:checked={draft.targetWeight} />
    </label>

    <fieldset class="themes">
      <legend>Theme</legend>
      <div class="chips">
        <label><input type="radio" name="theme" value={null} bind:group={draft.theme} /><span>Anything</span></label>
        {#each themes as [id, name] (id)}
          <label><input type="radio" name="theme" value={id} bind:group={draft.theme} /><span>{name}</span></label>
        {/each}
      </div>
    </fieldset>

    <button type="submit" class="start">Start</button>
  </form>
</dialog>

<style>
  dialog {
    width: min(100% - 2 * var(--space-4), 30rem);
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

  /* a bottom sheet on phones, within thumb reach */
  @media (max-width: 767px) {
    dialog {
      width: 100%;
      max-width: none;
      margin: auto 0 0;
      border-radius: 20px 20px 0 0;
      animation: up 260ms cubic-bezier(0.2, 0.9, 0.3, 1);
    }
  }

  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }

  .sheet {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) max(var(--space-5), env(safe-area-inset-right)) max(var(--space-5), env(safe-area-inset-bottom)) max(var(--space-5), env(safe-area-inset-left));
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) 0 0;
  }

  h2 {
    font-size: 30px;
  }

  .lede {
    margin: calc(-1 * var(--space-2)) 0 0;
    color: var(--ink-soft);
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

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    padding: 0;
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .row legend {
    float: left;
  }

  .row:disabled {
    opacity: 0.45;
  }

  .inset {
    justify-content: flex-start;
    margin-top: var(--space-2);
  }

  /* a row of joined buttons, like the weights on a set */
  .segments {
    display: inline-flex;
    padding: 3px;
    border-radius: var(--radius-control);
    background: var(--paper-sunk);
  }

  .segments label,
  .chips label,
  .switch {
    position: relative;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  input[type='radio'] {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .segments span {
    display: grid;
    place-items: center;
    min-width: var(--target);
    min-height: 38px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-control);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .segments input:checked + span {
    background: var(--paper-raised);
    box-shadow: 0 2px 6px -2px rgb(31 27 23 / 0.35);
  }

  input[type='radio']:focus-visible + span {
    outline: var(--focus-ring);
    outline-offset: var(--focus-offset);
  }

  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: var(--target);
    cursor: pointer;
  }

  .text {
    display: grid;
  }

  .text span {
    color: var(--ink-soft);
    font-size: var(--text-small);
    line-height: 1.35;
  }

  input[role='switch'] {
    appearance: none;
    flex: none;
    position: relative;
    width: 48px;
    height: 28px;
    margin: 0;
    border-radius: var(--radius-control);
    background: var(--paper-sunk);
    box-shadow: inset 0 0 0 1.5px var(--ink-soft);
    cursor: pointer;
    transition: background-color 150ms ease-out;
  }

  input[role='switch']::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--ink-soft);
    transition: transform 180ms cubic-bezier(0.3, 1.3, 0.5, 1);
  }

  input[role='switch']:checked {
    background: var(--enamel);
    box-shadow: none;
  }

  input[role='switch']:checked::after {
    background: var(--on-enamel);
    transform: translateX(20px);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .chips span {
    display: grid;
    place-items: center;
    min-height: 38px;
    padding: 0 var(--space-4);
    border: 1.5px solid var(--paper-sunk);
    border-radius: var(--radius-control);
    font-weight: 600;
  }

  .chips input:checked + span {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper-raised);
  }

  .start {
    min-height: 52px;
    margin-top: var(--space-2);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-size: 17px;
    font-weight: 600;
    cursor: pointer;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
