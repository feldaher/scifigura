<script lang="ts">
  import type { InteractionMode } from "../types";
  import Tooltip from "./Tooltip.svelte";

  let {
    mode,
    setMode,
    importImage,
    isPanToolActive = false,
  }: {
    mode: InteractionMode;
    setMode: (m: InteractionMode) => void;
    importImage?: () => void;
    isPanToolActive?: boolean;
  } = $props();
</script>

<aside class="toolbox">
  <!-- Navigation group -->
  <div class="group">
    <Tooltip label="Select" shortcut="V">
      <button
        class:active={mode === "select" && !isPanToolActive}
        onclick={() => setMode("select")}
        title="Select Tool (V)"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.6z" />
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Pan" shortcut="P">
      <button
        class:active={isPanToolActive}
        onclick={() => setMode("pan")}
        title="Pan Tool (P)"
      >
        <!-- Hand icon -->
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12 2c-1.1 0-2 .9-2 2v7h-1V4c0-1.1-.9-2-2-2s-2 .9-2 2v8h-1V6c0-1.1-.9-2-2-2S0 4.9 0 6v7.5c0 4.7 3.8 8.5 8.5 8.5h4c4.7 0 8.5-3.8 8.5-8.5V7c0-1.1-.9-2-2-2s-2 .9-2 2v5h-1V4c0-1.1-.9-2-2-2s-2 .9-2 2z"
          />
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Import Image" shortcut="Ctrl+O">
      <button onclick={importImage} title="Import Image (Ctrl+O)">
        <!-- Image icon -->
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </button>
    </Tooltip>
  </div>

  <div class="divider"></div>

  <!-- Drawing tools -->
  <div class="group">
    <Tooltip label="Rectangle" shortcut="R">
      <button
        class:active={mode === "draw_rectangle"}
        onclick={() => setMode("draw_rectangle")}
        title="Rectangle Tool (R)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          stroke="currentColor"
          fill="none"
          stroke-width="2"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Ellipse" shortcut="E">
      <button
        class:active={mode === "draw_ellipse"}
        onclick={() => setMode("draw_ellipse")}
        title="Ellipse Tool (E)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          stroke="currentColor"
          fill="none"
          stroke-width="2"
        >
          <ellipse cx="12" cy="12" rx="9" ry="9" />
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Line" shortcut="L">
      <button
        class:active={mode === "draw_line"}
        onclick={() => setMode("draw_line")}
        title="Line Tool (L)"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          stroke="currentColor"
          fill="none"
          stroke-width="2"
        >
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Text" shortcut="T">
      <button
        class:active={mode === "draw_text"}
        onclick={() => setMode("draw_text")}
        title="Text Tool (T)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
        </svg>
      </button>
    </Tooltip>
  </div>

  <div class="divider"></div>

  <!-- Scientific tools -->
  <div class="group">
    <Tooltip label="Panel Label" shortcut="H">
      <button
        class:active={mode === "draw_label"}
        onclick={() => setMode("draw_label")}
        title="Panel Label (H)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          <circle cx="18" cy="18" r="4" stroke-width="1.5" />
          <text
            x="18"
            y="21"
            font-size="6"
            text-anchor="middle"
            fill="currentColor"
            stroke="none">A</text
          >
        </svg>
      </button>
    </Tooltip>

    <Tooltip label="Scale Bar" shortcut="S">
      <button
        class:active={mode === "draw_scalebar"}
        onclick={() => setMode("draw_scalebar")}
        title="Scale Bar (S)"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 12h16M4 8v8M20 8v8" />
        </svg>
      </button>
    </Tooltip>
  </div>
</aside>

<style>
  .toolbox {
    width: 50px;
    box-sizing: border-box;
    background: #252525;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 4px;
    border-right: 1px solid #1a1a1a;
    flex-shrink: 0;
    z-index: 10;
    /* Make room for side-tooltips to overflow */
    overflow: visible;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    align-items: center;
  }

  button {
    width: 38px;
    height: 38px;
    background: transparent;
    border: none;
    color: #888;
    border-radius: 6px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition:
      background 0.1s,
      color 0.1s;
    position: relative;
  }

  button:hover {
    background: #333;
    color: #ddd;
  }

  button.active {
    background: rgba(33, 150, 243, 0.15);
    color: #fff;
    box-shadow: inset 2px 0 0 #2196f3;
  }

  button svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .divider {
    width: 28px;
    height: 1px;
    background: #333;
    margin: 2px 0;
  }
</style>
