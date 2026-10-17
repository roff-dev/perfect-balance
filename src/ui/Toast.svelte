<script lang="ts">
  interface Props {
    message: string;
  }

  let { message }: Props = $props();
</script>

<div class="toast" role="status">
  {#if message}
    <p>{message}</p>
  {/if}
</div>

<style>
  .toast {
    position: fixed;
    left: 50%;
    bottom: max(var(--space-5), env(safe-area-inset-bottom));
    transform: translateX(-50%);
    pointer-events: none;
    z-index: 10;
  }

  p {
    margin: 0;
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-control);
    background: var(--ink);
    color: var(--paper-raised);
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 10px 24px -12px rgb(31 27 23 / 0.6);
    animation: rise 220ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
</style>
