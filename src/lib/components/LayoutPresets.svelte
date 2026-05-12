<script lang="ts">
  import type { LayoutPreset } from "../types";
  import { LAYOUT_PRESETS } from "../utils/presets";

  let {
    activeLayoutPreset = $bindable(null),
    onClose,
  }: {
    activeLayoutPreset: LayoutPreset | null;
    onClose: () => void;
  } = $props();

  function applyLayout(preset: LayoutPreset) {
    activeLayoutPreset = preset;
  }

  function clearLayout() {
    activeLayoutPreset = null;
  }
</script>

<div class="layout-panel">
  <div class="panel-header">
    <span>Layout Grid Guides</span>
    <button class="close-btn" onclick={onClose}>×</button>
  </div>

  {#if activeLayoutPreset}
    <div class="active-bar">
      <span class="active-text">Active: {activeLayoutPreset.label}</span>
      <button class="clear-btn" onclick={clearLayout}>Clear</button>
    </div>
  {/if}

  <div class="preset-grid">
    {#each LAYOUT_PRESETS as preset}
      <button
        class="preset-card {activeLayoutPreset?.key === preset.key ? 'active' : ''}"
        onclick={() => applyLayout(preset)}
        title={preset.description}
      >
        <!-- Thumbnail SVG -->
        <svg viewBox="0 0 60 40" class="thumb">
          {#each preset.panels as p}
            <rect
              x={p.x * 60}
              y={p.y * 40}
              width={p.w * 60}
              height={p.h * 40}
              rx="1"
            />
          {/each}
        </svg>
        <span class="preset-label">{preset.label}</span>
      </button>
    {/each}
  </div>

  <p class="hint">Click a layout to overlay visual guides. Shapes will snap to these regions.</p>
</div>

<style>
  .layout-panel {
    position: absolute;
    top: 36px;
    left: 0;
    z-index: 300;
    background: #1e1e28;
    border: 1px solid #2e2e3e;
    border-radius: 8px;
    padding: 10px;
    width: 240px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #555;
    letter-spacing: 0.6px;
    margin-bottom: 10px;
  }

  .active-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: rgba(90, 171, 255, 0.1);
    border: 1px solid rgba(90, 171, 255, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    margin-bottom: 10px;
  }

  .active-text {
    font-size: 10px;
    color: #5aabff;
    font-weight: 600;
  }

  .clear-btn {
    font-size: 9px;
    background: transparent;
    border: 1px solid #5aabff;
    color: #5aabff;
    border-radius: 3px;
    padding: 2px 6px;
    cursor: pointer;
  }
  .clear-btn:hover {
    background: rgba(90, 171, 255, 0.2);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #444;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }
  .close-btn:hover {
    color: #aaa;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }

  .preset-card {
    background: #25252f;
    border: 1px solid #2e2e3e;
    border-radius: 6px;
    padding: 6px 4px 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition:
      background 0.15s,
      border-color 0.15s;
  }
  .preset-card:hover {
    background: #2e2e3e;
    border-color: #3a5a9a;
  }
  .preset-card.active {
    border-color: #5aabff;
    background: rgba(90, 171, 255, 0.05);
  }

  .thumb {
    width: 48px;
    height: 32px;
  }
  .thumb rect {
    fill: #3a3a4a;
    stroke: #5a6a9a;
    stroke-width: 0.5;
  }
  .preset-card:hover .thumb rect {
    fill: #2a3a6a;
    stroke: #5a8adf;
  }
  .preset-card.active .thumb rect {
    fill: rgba(90, 171, 255, 0.2);
    stroke: #5aabff;
  }

  .preset-label {
    font-size: 9px;
    color: #555;
    font-family: monospace;
  }
  .preset-card:hover .preset-label, .preset-card.active .preset-label {
    color: #aaa;
  }

  .hint {
    margin: 8px 0 0;
    font-size: 10px;
    color: #333;
    text-align: center;
  }
</style>
