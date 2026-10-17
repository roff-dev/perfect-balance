<script lang="ts"></script>

<svg viewBox="0 0 320 170" aria-hidden="true">
  <g class="ink">
    <path style:--i="0" pathLength="1" d="M112 160h96M132 160l10-12h36l10 12" />
    <path style:--i="1" pathLength="1" d="M156 148V48M164 148V48" />
    <path style:--i="2" pathLength="1" d="M60 46h200" />
  </g>
  <g class="brass">
    <path style:--i="3" pathLength="1" d="M160 38a8 8 0 1 1 0 16a8 8 0 1 1 0-16" />
    <path style:--i="4" pathLength="1" d="M64 46 38 112M64 46l26 66M256 46l-26 66M256 46l26 66" />
    <path style:--i="5" pathLength="1" d="M28 112h72q-4 22-36 22t-36-22ZM220 112h72q-4 22-36 22t-36-22Z" />
  </g>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }

  /* inked in stroke by stroke: the stand first, then the beam and pans */
  path {
    fill: none;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: ink 700ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    animation-delay: calc(var(--i) * 140ms + 150ms);
  }

  .ink path {
    stroke: var(--ink);
  }

  .brass path {
    stroke: var(--brass);
    stroke-width: 3;
  }

  @keyframes ink {
    to {
      stroke-dashoffset: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    path {
      animation: none;
      stroke-dashoffset: 0;
    }
  }
</style>
