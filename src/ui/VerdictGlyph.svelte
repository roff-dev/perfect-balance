<script lang="ts">
  import type { Verdict } from '../game/judge';

  interface Props {
    verdict: Verdict;
  }

  let { verdict }: Props = $props();
</script>

<!-- the share card's ■ ▲ ▼, so colour is never the only cue -->
<svg viewBox="0 0 12 12" width="0.62em" height="0.62em" aria-hidden="true">
  {#if verdict === 'balanced'}
    <rect x="1" y="1" width="10" height="10" rx="1" />
  {:else if verdict === 'heavy'}
    <path d="M6 1 11 11H1Z" />
  {:else}
    <path d="M6 11 1 1h10Z" />
  {/if}
</svg>

<style>
  svg {
    flex: none;
    fill: currentColor;
  }
</style>
