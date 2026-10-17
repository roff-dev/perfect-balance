<script lang="ts">
  import { onMount } from 'svelte';
  import Archive from './app/Archive.svelte';
  import Backup from './app/Backup.svelte';
  import End from './app/End.svelte';
  import Game from './app/Game.svelte';
  import Start from './app/Start.svelte';
  import { dailyGame, puzzleNumber } from './game/daily';
  import { generateGame, type Plan } from './game/generate';
  import { savedResult, type Result } from './game/judge';
  import { buildRound, type Round } from './game/round';
  import { currentStreak, lapsed, load, record, save, type Mode, type Progress } from './game/storage';
  import Toast from './ui/Toast.svelte';

  type Screen = 'start' | 'archive' | 'game' | 'end';

  interface Session {
    /** A numbered puzzle; a game from a seed has none. */
    puzzle?: { mode: Mode; n: number };
    plans: Plan[];
    rounds: Round[];
    /** Rounds already played, when it's resumed. */
    played: Result[];
    streakBefore: number;
  }

  const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

  /** `?seed=123` replays a particular game. */
  function seedFromUrl(): number | undefined {
    const param = new URLSearchParams(location.search).get('seed');
    if (param === null) return undefined;
    const n = Number(param);
    return Number.isInteger(n) && n >= 0 ? n >>> 0 : randomSeed();
  }

  let progress = $state<Progress>(load());
  let unsaved = $state(false);
  let now = $state(Date.now());
  const today = $derived(puzzleNumber(now));
  let screen = $state<Screen>('start');
  let session = $state.raw<Session>();
  let results = $state.raw<Result[]>([]);
  let backingUp = $state(false);
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showToast(message: string): void {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 2400);
  }

  function persist(): void {
    unsaved = !save($state.snapshot(progress) as Progress);
  }

  /** Leaving the start screen adds a history entry, so the back button comes back to it. */
  function go(next: Screen): void {
    if (screen === 'start' && next !== 'start' && !history.state?.away) history.pushState({ away: true }, '');
    screen = next;
  }

  function home(): void {
    if (session && !session.puzzle) {
      const url = new URL(location.href);
      url.searchParams.delete('seed');
      history.replaceState(null, '', url);
    }
    if (history.state?.away) history.back();
    else screen = 'start';
  }

  /** Sets up a game and says which screen shows it: the end screen if it's already finished. */
  function open(plans: Plan[], puzzle?: Session['puzzle']): Screen {
    // an archive puzzle already finished as a daily shows that result
    const saved = puzzle && (progress.daily[puzzle.n]?.done ? progress.daily[puzzle.n] : progress[puzzle.mode][puzzle.n]);
    const played = saved?.rounds.map((r, i) => savedResult(r, plans[i]!.prompt.weightKg)) ?? [];
    session = { puzzle, plans, rounds: plans.map(buildRound), played, streakBefore: currentStreak(progress.streak, today) };
    if (!saved?.done) return 'game';
    results = played;
    return 'end';
  }

  const openPuzzle = (mode: Mode, n: number) => go(open(dailyGame(n), { mode, n }));

  function playAgain(): void {
    const url = new URL(location.href);
    url.searchParams.delete('seed');
    history.replaceState(history.state, '', url);
    go(open(generateGame(randomSeed())));
  }

  function saveRounds(played: Result[]): void {
    const puzzle = session?.puzzle;
    if (!puzzle) return;
    const firstFinish = puzzle.mode === 'daily' && !Object.values(progress.daily).some((p) => p.done);
    record(progress, puzzle.mode, puzzle.n, played.map((r) => ({ ratio: r.ratio, win: r.verdict === 'balanced' })));
    persist();
    // asks the browser not to clear storage; the answer doesn't change anything here
    if (firstFinish && progress.daily[puzzle.n]?.done) void navigator.storage?.persist?.().catch(() => {});
  }

  function restore(restored: Progress): void {
    progress = restored;
    persist();
  }

  const linked = seedFromUrl();
  if (linked !== undefined) screen = open(generateGame(linked));

  onMount(() => {
    const clock = setInterval(() => (now = Date.now()), 1000);
    const back = () => {
      screen = 'start';
      session = undefined;
    };
    addEventListener('popstate', back);
    return () => {
      clearInterval(clock);
      removeEventListener('popstate', back);
    };
  });
</script>

{#if screen === 'start'}
  <Start
    {today}
    {now}
    played={progress.daily[today]}
    streak={progress.streak}
    current={currentStreak(progress.streak, today)}
    lapsed={lapsed(progress.streak, today)}
    onplay={() => openPuzzle('daily', today)}
    onarchive={() => go('archive')}
    onbackup={() => (backingUp = true)}
  />
{:else if screen === 'archive'}
  <Archive {today} {progress} onplay={(n) => openPuzzle('archive', n)} onback={home} />
{:else if session && screen === 'game'}
  {#key session}
    <Game
      rounds={session.rounds}
      played={session.played}
      onresult={saveRounds}
      onfinish={(r) => {
        results = r;
        go('end');
      }}
    />
  {/key}
{:else if session && screen === 'end'}
  {#key session}
    <End
      prompts={session.plans.map((p) => p.prompt.name)}
      {results}
      puzzle={session.puzzle}
      streak={session.puzzle?.mode === 'daily' ? { from: session.streakBefore, to: currentStreak(progress.streak, today) } : undefined}
      {unsaved}
      {now}
      ontoast={showToast}
      onplay={session.puzzle ? undefined : playAgain}
      onarchive={() => (screen = 'archive')}
      onhome={home}
    />
  {/key}
{/if}

{#if backingUp}
  <Backup {progress} onrestore={restore} ontoast={showToast} onclose={() => (backingUp = false)} />
{/if}

<Toast message={toast} />
