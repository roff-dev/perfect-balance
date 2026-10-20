<script lang="ts">
  import { onMount } from 'svelte';
  import Archive from './app/Archive.svelte';
  import Backup from './app/Backup.svelte';
  import CookieNotice from './app/CookieNotice.svelte';
  import End from './app/End.svelte';
  import Freeplay from './app/Freeplay.svelte';
  import HowToPlay from './app/HowToPlay.svelte';
  import type GameScreen from './app/Game.svelte';
  import type { Limits } from './app/game';
  import Start from './app/Start.svelte';
  import { canPlay } from './app/support';
  import Unsupported from './app/Unsupported.svelte';
  import { loadCatalogue, type CatalogueEntry } from './data/catalogue';
  import { CONFIG } from './game/config';
  import { dailyGame, puzzleNumber } from './game/daily';
  import { describeRules, fromQuery, RoundSupply, rulesFor, toQuery, type FreeplaySettings } from './game/freeplay';
  import { savedResult, type Result } from './game/judge';
  import { currentStreak, lapsed, load, record, save, type Mode, type Progress } from './game/storage';
  import Toast from './ui/Toast.svelte';

  type Screen = 'start' | 'archive' | 'game' | 'end' | 'unsupported';

  interface Session {
    /** A numbered puzzle; a freeplay game has none. */
    puzzle?: { mode: Mode; n: number };
    freeplay?: FreeplaySettings;
    rounds: RoundSupply;
    /** Rounds already played, when it's resumed. */
    played: Result[];
    streakBefore: number;
  }

  const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

  let catalogue: Promise<readonly CatalogueEntry[]> | undefined;

  /** Loads the catalogue once; if it fails, the next game tries again. */
  function withCatalogue(): Promise<readonly CatalogueEntry[]> {
    catalogue ??= loadCatalogue().catch((e: unknown) => {
      catalogue = undefined;
      throw e;
    });
    return catalogue;
  }

  let gameScreen: Promise<typeof GameScreen> | undefined;
  /** three.js and the scene come with the game screen, so the start screen doesn't wait for them. */
  let Game = $state.raw<typeof GameScreen>();

  /** Loads the game screen once; if it fails, the next game tries again. */
  function withGame(): Promise<typeof GameScreen> {
    gameScreen ??= import('./app/Game.svelte').then(
      (m) => (Game = m.default),
      (e: unknown) => {
        gameScreen = undefined;
        throw e;
      },
    );
    return gameScreen;
  }

  /** True while a game waits for the catalogue or its screen, after the player asked for it. */
  let starting = $state(false);

  /** Everything a game needs before its screen can show. */
  async function ready(): Promise<readonly CatalogueEntry[]> {
    starting = true;
    try {
      const [entries] = await Promise.all([withCatalogue(), withGame()]);
      return entries;
    } finally {
      starting = false;
    }
  }

  /** `?seed=123` (and any rules with it) replays a particular freeplay game. */
  function linkedGame(): { seed: number; settings: FreeplaySettings } | undefined {
    const query = new URLSearchParams(location.search);
    const param = query.get('seed');
    if (param === null) return undefined;
    const n = Number(param);
    return { seed: Number.isInteger(n) && n >= 0 ? n >>> 0 : randomSeed(), settings: fromQuery(query) };
  }

  let progress = $state<Progress>(load());
  let unsaved = $state(false);
  let now = $state(Date.now());
  const today = $derived(puzzleNumber(now));
  let screen = $state<Screen>('start');
  let session = $state.raw<Session>();
  let results = $state.raw<Result[]>([]);
  let backingUp = $state(false);
  let explaining = $state(false);
  let choosingRules = $state(false);
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
    if (session?.freeplay) history.replaceState(history.state, '', location.pathname);
    if (history.state?.away) history.back();
    else screen = 'start';
  }

  /** Sets up a game and says which screen shows it: the end screen if it's already finished. */
  function open(rounds: RoundSupply, puzzle?: Session['puzzle'], freeplay?: FreeplaySettings): Screen {
    // an archive puzzle already finished as a daily shows that result
    const saved = puzzle && (progress.daily[puzzle.n]?.done ? progress.daily[puzzle.n] : progress[puzzle.mode][puzzle.n]);
    const played = saved?.rounds.map((r, i) => savedResult(r, rounds.plan(i).prompt.weightKg)) ?? [];
    session = { puzzle, freeplay, rounds, played, streakBefore: currentStreak(progress.streak, today) };
    if (!saved?.done) return 'game';
    results = played;
    return 'end';
  }

  const offline = () => showToast("Couldn't load the objects. Check your connection and try again.");

  async function openPuzzle(mode: Mode, n: number): Promise<void> {
    if (starting) return;
    if (!canPlay()) return go('unsupported');
    const entries = await ready().catch(() => undefined);
    if (entries) go(open(RoundSupply.of(dailyGame(n, entries)), { mode, n }));
    else offline();
  }

  /** The address bar always holds the game's link, so it can be shared or reloaded. */
  async function openFreeplay(seed: number, settings: FreeplaySettings): Promise<void> {
    if (starting) return;
    if (!canPlay()) return go('unsupported');
    const entries = await ready().catch(() => undefined);
    if (!entries) return offline();
    go(open(RoundSupply.freeplay(seed, settings, entries), undefined, settings));
    history.replaceState(history.state, '', location.pathname + toQuery(seed, settings));
  }

  function startFreeplay(settings: FreeplaySettings): void {
    progress.settings.freeplay = settings;
    persist();
    void openFreeplay(randomSeed(), settings);
  }

  const limitsFor = (s: FreeplaySettings): Limits => ({ margin: rulesFor(s).margin, maxBodies: s.cap || CONFIG.maxDynamicBodies });

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

  const linked = linkedGame();
  if (linked && !canPlay()) {
    screen = 'unsupported';
  } else if (linked) {
    // shows nothing until the game is ready
    screen = 'game';
    ready().then(
      (entries) => (screen = open(RoundSupply.freeplay(linked.seed, linked.settings, entries), undefined, linked.settings)),
      () => {
        screen = 'start';
        offline();
      },
    );
  }

  onMount(() => {
    // the first game shouldn't have to wait for them
    withCatalogue().catch(() => {});
    const prefetch = () => void withGame().catch(() => {});
    let cancelPrefetch: () => void;
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(prefetch, { timeout: 2000 });
      cancelPrefetch = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(prefetch, 200);
      cancelPrefetch = () => clearTimeout(id);
    }
    const clock = setInterval(() => (now = Date.now()), 1000);
    const back = () => {
      screen = 'start';
      session = undefined;
    };
    addEventListener('popstate', back);
    return () => {
      clearInterval(clock);
      cancelPrefetch();
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
    busy={starting}
    cookieEaten={progress.settings.cookieEaten}
    introSeen={progress.settings.introSeen}
    onintroseen={() => {
      progress.settings.introSeen = true;
      persist();
    }}
    onplay={() => void openPuzzle('daily', today)}
    onarchive={() => go('archive')}
    onfreeplay={() => (choosingRules = true)}
    onbackup={() => (backingUp = true)}
    onhowto={() => (explaining = true)}
  />
{:else if screen === 'archive'}
  <Archive {today} {progress} onplay={(n) => void openPuzzle('archive', n)} onback={home} />
{:else if Game && session && screen === 'game'}
  {#key session}
    <Game
      rounds={session.rounds}
      limits={session.freeplay ? limitsFor(session.freeplay) : undefined}
      rules={session.freeplay ? describeRules(session.freeplay) : ''}
      played={session.played}
      onresult={saveRounds}
      onrestart={(played) => (session = { ...session!, played })}
      onunsupported={() => (screen = 'unsupported')}
      onleave={session.puzzle ? home : undefined}
      daily={session.puzzle?.mode === 'daily'}
      onfinish={(r) => {
        results = r;
        go('end');
      }}
    />
  {/key}
{:else if screen === 'unsupported'}
  <Unsupported onback={home} />
{:else if session && screen === 'end'}
  {#key session}
    <End
      prompts={results.map((_, i) => session!.rounds.plan(i).prompt.name)}
      {results}
      puzzle={session.puzzle}
      endless={session.freeplay?.endless}
      streak={session.puzzle?.mode === 'daily' ? { from: session.streakBefore, to: currentStreak(progress.streak, today) } : undefined}
      {unsaved}
      {now}
      ontoast={showToast}
      onplay={() => void openFreeplay(randomSeed(), session!.freeplay!)}
      onrules={() => (choosingRules = true)}
      onarchive={() => (screen = 'archive')}
      onhome={home}
    />
  {/key}
{/if}

{#if choosingRules}
  <Freeplay settings={progress.settings.freeplay} onstart={startFreeplay} onclose={() => (choosingRules = false)} />
{/if}

{#if explaining}
  <HowToPlay onclose={() => (explaining = false)} />
{/if}

{#if screen === 'start' && !progress.settings.cookieEaten}
  <CookieNotice
    oneaten={() => {
      progress.settings.cookieEaten = true;
      persist();
    }}
  />
{/if}

{#if backingUp}
  <Backup {progress} onrestore={restore} ontoast={showToast} onclose={() => (backingUp = false)} />
{/if}

<Toast message={toast} />
