<script>
  let { label = "", shortcut = "", children } = $props();
</script>

<div class="tooltip-wrap">
  {@render children?.()}
  {#if label}
    <div class="tooltip">
      <span class="tooltip-label">{label}</span>
      {#if shortcut}
        <kbd class="tooltip-kbd">{shortcut}</kbd>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tooltip-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .tooltip {
    pointer-events: none;
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: #1a1a1a;
    border: 1px solid #3a3a3a;
    color: #e0e0e0;
    white-space: nowrap;
    padding: 5px 9px;
    border-radius: 5px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    display: flex;
    align-items: center;
    gap: 7px;
    opacity: 0;
    transition: opacity 0.12s ease;
    z-index: 9999;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  /* Arrow pointing left */
  .tooltip::before {
    content: "";
    position: absolute;
    right: 100%;
    top: 50%;
    transform: translateY(-50%);
    border: 5px solid transparent;
    border-right-color: #3a3a3a;
  }

  .tooltip-wrap:hover .tooltip {
    opacity: 1;
  }

  .tooltip-label {
    font-weight: 500;
  }

  .tooltip-kbd {
    background: #2e2e2e;
    border: 1px solid #555;
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: monospace;
    font-size: 11px;
    color: #aaa;
    line-height: 1.4;
  }
</style>
