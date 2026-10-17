<script lang="ts">
  const swatches = [
    { name: 'paper', hex: '#EFE8DC', use: 'Page and scene' },
    { name: 'paper-raised', hex: '#F8F4EC', use: 'Panels, tiles' },
    { name: 'paper-sunk', hex: '#E4DACA', use: 'Inventory well' },
    { name: 'ink', hex: '#1F1B17', use: 'Text', ratio: '14.05' },
    { name: 'ink-soft', hex: '#5C5249', use: 'Secondary text', ratio: '6.25' },
    { name: 'brass', hex: '#B8892F', use: 'Metal, rules' },
    { name: 'brass-ink', hex: '#7A5617', use: 'Brass text', ratio: '5.44' },
    { name: 'enamel', hex: '#24365C', use: 'Primary action', ratio: '9.81' },
    { name: 'heavy', hex: '#A3392A', use: 'Too heavy', ratio: '5.43' },
    { name: 'light', hex: '#2C5C8C', use: 'Too light', ratio: '5.72' },
    { name: 'balanced', hex: '#3B6636', use: 'Balanced', ratio: '5.49' },
  ];
</script>

<main>
  <header>
    <p class="mark">Standard No. 1</p>
    <h1>Perfect Balance</h1>
    <p class="lede">Adult male African savanna elephant</p>
  </header>

  <section aria-labelledby="palette">
    <h2 id="palette">Palette</h2>
    <ul class="swatches">
      {#each swatches as s (s.name)}
        <li>
          <span class="chip" style:background="var(--{s.name})"></span>
          <span class="name">{s.name}</span>
          <span class="use">{s.use}</span>
          <span class="ratio">{s.ratio ? `${s.ratio}:1` : ''}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="type">
    <h2 id="type">Type</h2>
    <div class="verdicts">
      <p class="verdict" style:color="var(--balanced)">Balanced.</p>
      <p class="verdict" style:color="var(--heavy)">Too heavy.</p>
      <p class="verdict" style:color="var(--light)">Too light.</p>
    </div>
    <p class="figures">98.1 · 101.7 · 131.0 · 99.2 · 64.3</p>
    <p class="body">Drag something onto your pan. That's plenty — the pan's full.</p>
    <button class="primary">Hold to lock in</button>
  </section>
</main>

<style>
  main {
    max-width: 72rem;
    margin: 0 auto;
    padding: max(var(--space-6), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      var(--space-7) max(var(--space-4), env(safe-area-inset-left));
  }

  header {
    border-bottom: 1px solid var(--brass);
    padding-bottom: var(--space-5);
    margin-bottom: var(--space-6);
  }

  .mark {
    margin: 0 0 var(--space-3);
    color: var(--brass-ink);
    font-size: var(--text-small);
    font-variant-numeric: tabular-nums;
  }

  h1 {
    font-size: var(--text-display);
    letter-spacing: -0.02em;
  }

  .lede {
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: var(--text-title);
    color: var(--ink-soft);
    margin: var(--space-3) 0 0;
    line-height: 1.15;
  }

  section + section {
    margin-top: var(--space-7);
  }

  h2 {
    font-size: var(--text-title);
    margin-bottom: var(--space-5);
  }

  .swatches {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .swatches li {
    display: grid;
    grid-template-columns: 3rem 1fr auto;
    grid-template-areas: 'chip name ratio' 'chip use ratio';
    column-gap: var(--space-4);
    align-items: center;
    padding: var(--space-3) 0;
    border-top: 1px solid var(--paper-sunk);
  }

  .chip {
    grid-area: chip;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgb(31 27 23 / 0.12);
  }

  .name {
    grid-area: name;
    font-weight: 600;
  }

  .use {
    grid-area: use;
    color: var(--ink-soft);
    font-size: var(--text-small);
  }

  .ratio {
    grid-area: ratio;
    font-variant-numeric: tabular-nums;
    color: var(--ink-soft);
  }

  .verdicts {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--space-6);
  }

  .verdict {
    font-family: var(--font-display);
    font-variation-settings: var(--display-soft);
    font-size: clamp(40px, 5vw + 1rem, 72px);
    line-height: 1.1;
    margin: 0;
  }

  .figures {
    font-variant-numeric: tabular-nums;
    font-size: 20px;
    margin: var(--space-5) 0 var(--space-3);
  }

  .body {
    max-width: 38rem;
    color: var(--ink-soft);
  }

  .primary {
    min-height: var(--target);
    padding: 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-control);
    background: var(--enamel);
    color: var(--on-enamel);
    font-weight: 600;
    cursor: pointer;
  }

  @media (min-width: 768px) {
    .swatches {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      column-gap: var(--space-6);
    }
  }
</style>
