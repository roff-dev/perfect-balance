<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    /** The round a numbered puzzle carries on from; a freeplay game can't be finished later. */
    resume?: number;
    /** A freeplay game that runs until the first miss. */
    endless?: boolean;
    /** Today's puzzle, which counts towards the streak. */
    daily?: boolean;
    onlater: () => void;
    ongiveup: () => void;
    onclose: () => void;
  }

  let { resume, endless = false, daily = false, onlater, ongiveup, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  /** What closing the dialog leads to; Escape and the cross just go back to the game. */
  let then: (() => void) | undefined;

  function choose(action: () => void): void {
    then = action;
    dialog.close();
  }

  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} onclose={() => (then ?? onclose)()} aria-labelledby="leave-title" aria-describedby="leave-line">
  <div class="sheet">
    <header>
      <h2 id="leave-title">{resume ? 'Leave this game?' : 'Give up this game?'}</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <div id="leave-line">
      {#if resume}
        <p>Your finished rounds are saved, so you can carry on from round {resume} later.</p>
        <p>Giving up scores the rounds left as empty pans and shows your result.{#if daily}{' '}It still counts for your streak.{/if}</p>
      {:else if endless}
        <p>This round scores as an empty pan, and you'll see how many you balanced in a row.</p>
      {:else}
        <p>The rounds left score as empty pans, and you'll see your result.</p>
      {/if}
    </div>
    <div class="actions">
      {#if resume}
        <button type="button" class="action" onclick={() => choose(onlater)}>Finish later</button>
      {:else}
        <button type="button" class="action" onclick={() => dialog.close()}>Keep playing</button>
      {/if}
      <button type="button" class="action secondary" onclick={() => choose(ongiveup)}>Give up</button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(100% - 2 * var(--space-4), 26rem);
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

  .sheet {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3)) 0 0;
  }

  h2 {
    font-size: 26px;
  }

  #leave-line {
    display: grid;
    gap: var(--space-2);
  }

  p {
    margin: 0;
    color: var(--ink-soft);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-2);
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

  .action {
    min-height: var(--target);
    padding: 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-weight: 600;
    cursor: pointer;
  }

  .secondary {
    border: 1.5px solid var(--ink);
    background: none;
    color: var(--ink);
  }
</style>
