<script lang="ts">
  import type { InteractionMode } from "../types";

  let {
    mode,
    setMode,
    importImage,
  }: {
    mode: InteractionMode;
    setMode: (m: InteractionMode) => void;
    importImage?: () => void;
  } = $props();
</script>

<aside class="toolbox">
  <div class="group">
    <button
      class:active={mode === "select"}
      onclick={() => setMode("select")}
      title="Move Tool (V)"
    >
      <!-- Move Icon -->
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.6z" />
      </svg>
    </button>
    <button
      class:active={mode === "pan"}
      onclick={() => setMode("pan")}
      title="View Tool (H)"
    >
      <!-- Hand Icon -->
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 2c-1.1 0-2 .9-2 2v7h-1V4c0-1.1-.9-2-2-2s-2 .9-2 2v8h-1V6c0-1.1-.9-2-2-2S0 4.9 0 6v7.5c0 4.7 3.8 8.5 8.5 8.5h4c4.7 0 8.5-3.8 8.5-8.5V7c0-1.1-.9-2-2-2s-2 .9-2 2v5h-1V4c0-1.1-.9-2-2-2s-2 .9-2 2z"
        />
      </svg>
    </button>
    <button onclick={importImage} title="Import Image">
      <!-- Image Icon -->
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
  </div>

  <div class="divider"></div>

  <div class="group">
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
    <button
      class:active={mode === "draw_line"}
      onclick={() => setMode("draw_line")}
      title="Pen Tool - Line (L)"
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
    <button
      class:active={mode === "draw_text"}
      onclick={() => setMode("draw_text")}
      title="Text (T)"
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
  </div>

  <div class="separator"></div>

  <!-- Scientific Tools -->
  <div class="group">
    <button
      class:active={mode === "draw_label"}
      onclick={() => setMode("draw_label")}
      title="Panel Label (Auto-A, B, C...)"
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
    <button
      class:active={mode === "draw_scalebar"}
      onclick={() => setMode("draw_scalebar")}
      title="Scale Bar"
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
  </div>
</aside>

<style>
  .toolbox {
    width: 50px;
    background: #2c2c2c; /* Affinity-like dark gray */
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 10px;
    border-right: 1px solid #1a1a1a;
    flex-shrink: 0;
    z-index: 10;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    align-items: center;
  }

  button {
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    color: #a0a0a0;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.1s;
  }

  button:hover {
    background: #3e3e3e;
    color: #dedede;
  }

  button.active {
    background: #4a4a4a;
    color: #fff;
    box-shadow: inset 2px 0 0 #2196f3; /* Left accent bar */
  }

  button svg {
    width: 20px;
    height: 20px;
  }

  .divider {
    width: 30px;
    height: 1px;
    background: #444;
    margin: 5px 0;
  }
</style>
