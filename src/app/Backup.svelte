<script lang="ts">
  import { onMount } from 'svelte';
  import { backupCode, restoreCode, type Progress } from '../game/storage';

  interface Props {
    progress: Progress;
    onrestore: (progress: Progress) => void;
    ontoast: (message: string) => void;
    onclose: () => void;
  }

  let { progress, onrestore, ontoast, onclose }: Props = $props();

  let dialog: HTMLDialogElement;
  let code = $state('');
  let pasted = $state('');
  let error = $state('');
  let restoring = $state(false);

  onMount(() => {
    dialog.showModal();
    void backupCode($state.snapshot(progress) as Progress).then((c) => (code = c));
  });

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      ontoast('Copied');
    } catch {
      ontoast("Couldn't copy. Select the code and copy it by hand.");
    }
  }

  async function restore(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    restoring = true;
    const restored = await restoreCode(pasted);
    restoring = false;
    if (!restored) {
      error = "That isn't a Perfect Balance backup code. Check it was copied whole, then paste it again.";
      return;
    }
    onrestore(restored);
    ontoast('Progress restored');
    dialog.close();
  }
</script>

<dialog bind:this={dialog} {onclose} aria-labelledby="backup-title">
  <div class="sheet">
    <header>
      <h2 id="backup-title">Back up progress</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => dialog.close()}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" /></svg>
      </button>
    </header>
    <p>Your results and streak live in this browser only. Keep this code somewhere safe, or paste it into another browser to carry on there.</p>
    <textarea class="code" readonly rows="3" aria-label="Your backup code" value={code || 'Making your code…'} onfocus={(e) => e.currentTarget.select()}></textarea>
    <button type="button" class="action" disabled={!code} onclick={copy}>Copy code</button>

    <form onsubmit={restore}>
      <h3>Restore from a code</h3>
      <p>This replaces the progress in this browser.</p>
      <textarea
        rows="3"
        aria-label="Backup code to restore"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? 'restore-error' : undefined}
        placeholder="Paste a backup code"
        bind:value={pasted}
        oninput={() => (error = '')}
      ></textarea>
      {#if error}
        <p class="error" id="restore-error" role="alert">{error}</p>
      {/if}
      <button type="submit" class="action secondary" disabled={!pasted.trim() || restoring}>Restore progress</button>
    </form>
  </div>
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

  h3 {
    margin-top: var(--space-5);
    padding-top: var(--space-4);
    border-top: 1px solid var(--paper-sunk);
    font-size: 20px;
  }

  p {
    margin: 0;
    color: var(--ink-soft);
  }

  form {
    display: grid;
    gap: var(--space-3);
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

  textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--paper-sunk);
    border-radius: 10px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 16px;
    resize: vertical;
  }

  .code {
    font-size: var(--text-small);
    word-break: break-all;
  }

  textarea[aria-invalid] {
    border-color: var(--heavy);
  }

  .error {
    color: var(--heavy);
  }

  .action {
    justify-self: start;
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

  .action:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
