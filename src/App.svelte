<script lang="ts">
  import End from './app/End.svelte';
  import Game from './app/Game.svelte';
  import { generateGame } from './game/generate';
  import type { Result } from './game/judge';
  import { buildRound } from './game/round';

  const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

  /** `?seed=123` replays a particular game. */
  function seedFromUrl(): number {
    const param = new URLSearchParams(location.search).get('seed');
    const n = param === null ? NaN : Number(param);
    return Number.isInteger(n) && n >= 0 ? n >>> 0 : randomSeed();
  }

  let seed = $state(seedFromUrl());
  const plans = $derived(generateGame(seed));
  const rounds = $derived(plans.map(buildRound));
  let results = $state<Result[]>();

  function playAgain(): void {
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    history.replaceState(null, '', url);
    seed = randomSeed();
    results = undefined;
  }
</script>

{#if results}
  <End prompts={plans.map((p) => p.prompt.name)} {results} onplay={playAgain} />
{:else}
  {#key seed}
    <Game {rounds} onfinish={(r) => (results = r)} />
  {/key}
{/if}
