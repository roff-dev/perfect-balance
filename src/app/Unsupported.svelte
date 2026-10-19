<script lang="ts">
  import { onMount } from 'svelte';
  import preview from '../assets/preview.mp4';

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  let heading: HTMLElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  onMount(() => heading.focus());
</script>

<main class="unsupported">
  <button type="button" class="back" onclick={onback}>
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
    Back
  </button>

  <div class="body">
    <div class="copy">
      <h1 bind:this={heading} tabindex="-1">This scale needs 3D graphics</h1>
      <p class="note">Your browser isn't drawing 3D at the moment, so the scale can't be set up. This is what a round looks like.</p>

      <h2>What usually helps</h2>
      <ul>
        <li>Turn on hardware acceleration in your browser's settings, then restart the browser.</li>
        <li>Update your browser, or try a current Chrome, Edge, Firefox or Safari.</li>
        <li>Some work and school computers switch 3D off. Try your phone instead.</li>
      </ul>
    </div>

    <figure>
      <!-- with reduced motion it waits to be played -->
      <video
        src={preview}
        muted
        loop
        playsinline
        autoplay={!still}
        controls={still}
        preload={still ? 'metadata' : 'auto'}
        aria-label="A round being played: things go onto the right-hand pan until the beam levels."
      ></video>
    </figure>
  </div>
</main>

<style>
  .unsupported {
    width: min(100%, 64rem);
    min-height: 100svh;
    margin: 0 auto;
    padding: max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-6), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--target);
    margin-left: -6px;
    padding: 0 var(--space-2) 0 0;
    border: 0;
    background: none;
    font-weight: 600;
    cursor: pointer;
  }

  .back path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  h1 {
    margin-top: var(--space-3);
    font-size: var(--text-title);
    outline: none;
  }

  .note {
    max-width: 40ch;
    margin: var(--space-2) 0 var(--space-5);
    color: var(--ink-soft);
  }

  h2 {
    color: var(--brass-ink);
    font-size: 20px;
  }

  ul {
    max-width: 44ch;
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--paper-sunk);
  }

  li {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--paper-sunk);
  }

  figure {
    width: min(100%, 26rem);
    margin: 0;
  }

  /* the clip is the scene on paper, so it sits straight on the page; the soft edge hides any shift in colour */
  video {
    display: block;
    width: 100%;
    background: var(--paper);
    mask-image: radial-gradient(closest-side, #000 75%, transparent);
  }

  /* the clip beside the words */
  @media (min-width: 900px) {
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: var(--space-7);
      min-height: calc(100svh - 2 * var(--space-6) - var(--target));
    }

    figure {
      width: 100%;
    }
  }
</style>
