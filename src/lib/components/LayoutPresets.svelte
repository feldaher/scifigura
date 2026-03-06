<script lang="ts">
  import type { CanvasObject } from "../types";

  // Layout preset definitions
  // Positions are normalized 0–1 (fraction of paper). Gutter = 0.02 = 2%.
  const G = 0.02; // gutter

  interface PanelRect {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface LayoutPreset {
    key: string;
    label: string;
    description: string;
    panels: PanelRect[];
  }

  const LAYOUTS: LayoutPreset[] = [
    {
      key: "1x1",
      label: "1 × 1",
      description: "Single full panel",
      panels: [{ x: G, y: G, w: 1 - 2 * G, h: 1 - 2 * G }],
    },
    {
      key: "1x2",
      label: "1 × 2",
      description: "Two columns",
      panels: [
        { x: G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
        { x: G + (1 - 3 * G) / 2 + G, y: G, w: (1 - 3 * G) / 2, h: 1 - 2 * G },
      ],
    },
    {
      key: "2x1",
      label: "2 × 1",
      description: "Two rows",
      panels: [
        { x: G, y: G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
        { x: G, y: G + (1 - 3 * G) / 2 + G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
      ],
    },
    {
      key: "2x2",
      label: "2 × 2",
      description: "Four equal panels",
      panels: [
        { x: G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
        {
          x: G + (1 - 3 * G) / 2 + G,
          y: G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
        {
          x: G,
          y: G + (1 - 3 * G) / 2 + G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
        {
          x: G + (1 - 3 * G) / 2 + G,
          y: G + (1 - 3 * G) / 2 + G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
      ],
    },
    {
      key: "1+2",
      label: "1 + 2",
      description: "Wide top, two columns below",
      panels: [
        { x: G, y: G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
        {
          x: G,
          y: G + (1 - 3 * G) / 2 + G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
        {
          x: G + (1 - 3 * G) / 2 + G,
          y: G + (1 - 3 * G) / 2 + G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
      ],
    },
    {
      key: "2+1",
      label: "2 + 1",
      description: "Two columns above, wide below",
      panels: [
        { x: G, y: G, w: (1 - 3 * G) / 2, h: (1 - 3 * G) / 2 },
        {
          x: G + (1 - 3 * G) / 2 + G,
          y: G,
          w: (1 - 3 * G) / 2,
          h: (1 - 3 * G) / 2,
        },
        { x: G, y: G + (1 - 3 * G) / 2 + G, w: 1 - 2 * G, h: (1 - 3 * G) / 2 },
      ],
    },
    {
      key: "1x3",
      label: "1 × 3",
      description: "Three columns",
      panels: (() => {
        const w = (1 - 4 * G) / 3;
        return [0, 1, 2].map((i) => ({
          x: G + i * (w + G),
          y: G,
          w,
          h: 1 - 2 * G,
        }));
      })(),
    },
    {
      key: "3x2",
      label: "3 × 2",
      description: "Three columns, two rows",
      panels: (() => {
        const cw = (1 - 4 * G) / 3;
        const ch = (1 - 3 * G) / 2;
        const ps: PanelRect[] = [];
        for (let row = 0; row < 2; row++)
          for (let col = 0; col < 3; col++)
            ps.push({
              x: G + col * (cw + G),
              y: G + row * (ch + G),
              w: cw,
              h: ch,
            });
        return ps;
      })(),
    },
  ];

  let {
    paperW,
    paperH,
    onApply,
    onClose,
  }: {
    paperW: number;
    paperH: number;
    onApply: (objects: CanvasObject[]) => void;
    onClose: () => void;
  } = $props();

  function applyLayout(preset: LayoutPreset) {
    const newObjects: CanvasObject[] = preset.panels.map((p, i) => ({
      id: crypto.randomUUID(),
      type: "rectangle" as const,
      x: Math.round(p.x * paperW),
      y: Math.round(p.y * paperH),
      width: Math.round(p.w * paperW),
      height: Math.round(p.h * paperH),
      fill: "transparent",
      stroke: "#aaaaaa",
      strokeWidth: 1,
      dash: [4, 4],
      rotation: 0,
      label: String.fromCharCode(65 + i), // A, B, C…
      labelPosition: "top-left",
    }));
    onApply(newObjects);
  }
</script>

<div class="layout-panel">
  <div class="panel-header">
    <span>Layout Presets</span>
    <button class="close-btn" onclick={onClose}>×</button>
  </div>

  <div class="preset-grid">
    {#each LAYOUTS as preset}
      <button
        class="preset-card"
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

  <p class="hint">Adds dashed placeholder panels to your canvas.</p>
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
    grid-template-columns: repeat(4, 1fr);
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

  .preset-label {
    font-size: 9px;
    color: #555;
    font-family: monospace;
  }
  .preset-card:hover .preset-label {
    color: #aaa;
  }

  .hint {
    margin: 8px 0 0;
    font-size: 10px;
    color: #333;
    text-align: center;
  }
</style>
