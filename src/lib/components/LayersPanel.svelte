<script lang="ts">
  import type { CanvasObject } from "../types";

  export let objects: CanvasObject[];
  export let selectedIds: Set<string>;
  export let updateObject: (
    id: string,
    props: Partial<CanvasObject>,
    save?: boolean,
  ) => void;
  export let reorderObjects: (fromIndex: number, toIndex: number) => void;
  export let toggleSelection: (id: string, shiftKey: boolean) => void;

  let editingId: string | null = null;

  // ── Pointer-based drag-to-reorder ───────────────────────────────────────
  // Strategy: pointer-capture routes all move events to the drag-source element,
  // so we cannot use per-item onpointermove to determine the target row.
  // Instead we attach a window-level listener and probe each item's bounding rect.

  let dragging = false;
  let dragSourceIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let layerListEl: HTMLElement | null = null; // bound to the list container

  function onPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return;
    dragging = false;
    dragSourceIndex = index;
    dragOverIndex = index;
    // Capture so pointerup/cancel always fire on this element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    e.preventDefault(); // Prevent text selection while dragging
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (dragSourceIndex === null) return;
    dragging = true;

    if (!layerListEl) return;
    const items = layerListEl.querySelectorAll<HTMLElement>(".layer-item");
    let found = dragOverIndex; // keep last known

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      // The list is rendered reversed, so item[i] has reverseIndex i → actualIndex = objects.length-1-i
      if (e.clientY >= rect.top && e.clientY < rect.bottom) {
        found = objects.length - 1 - i;
        break;
      }
    }
    dragOverIndex = found;
  }

  function onWindowPointerUp(_e: PointerEvent) {
    cleanupWindowListeners();
    if (
      dragging &&
      dragSourceIndex !== null &&
      dragOverIndex !== null &&
      dragSourceIndex !== dragOverIndex
    ) {
      reorderObjects(dragSourceIndex, dragOverIndex);
    }
    dragging = false;
    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function onWindowPointerCancel() {
    cleanupWindowListeners();
    dragging = false;
    dragSourceIndex = null;
    dragOverIndex = null;
  }

  function cleanupWindowListeners() {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerCancel);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getObjectLabel(obj: CanvasObject): string {
    if (obj.name) return obj.name;
    const typeLabel = obj.type.charAt(0).toUpperCase() + obj.type.slice(1);
    if (obj.type === "text" && obj.text) {
      return `Text: "${obj.text.slice(0, 15)}${obj.text.length > 15 ? "..." : ""}"`;
    }
    return typeLabel;
  }
</script>

<div class="layers-panel">
  <div class="header">
    <h3>Layers</h3>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="layer-list" role="list" bind:this={layerListEl}>
    {#each [...objects].reverse() as obj, reversedIndex (obj.id)}
      {@const actualIndex = objects.length - 1 - reversedIndex}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="layer-item
          {selectedIds.has(obj.id) ? 'selected' : ''}
          {dragging &&
        dragOverIndex === actualIndex &&
        dragSourceIndex !== actualIndex
          ? 'drag-over'
          : ''}
          {dragging && dragSourceIndex === actualIndex ? 'dragging' : ''}"
        role="listitem"
        tabindex="0"
        on:click|stopPropagation={() => {
          if (!dragging) toggleSelection(obj.id, false);
        }}
        on:keydown={(e) => {
          if (e.key === "Enter") toggleSelection(obj.id, false);
        }}
      >
        <!-- Drag handle — only this bit initiates dragging -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="drag-handle"
          title="Drag to reorder"
          on:pointerdown={(e) => onPointerDown(e, actualIndex)}
        >
          <svg
            width="10"
            height="14"
            viewBox="0 0 10 14"
            fill="currentColor"
            opacity="0.5"
          >
            <circle cx="3" cy="2" r="1.3" /><circle cx="7" cy="2" r="1.3" />
            <circle cx="3" cy="7" r="1.3" /><circle cx="7" cy="7" r="1.3" />
            <circle cx="3" cy="12" r="1.3" /><circle cx="7" cy="12" r="1.3" />
          </svg>
        </div>

        <div class="layer-controls">
          <button
            class="icon-btn {obj.hidden ? 'active' : ''}"
            title="Toggle Visibility"
            on:click|stopPropagation={() =>
              updateObject(obj.id, { hidden: !obj.hidden })}
          >
            {#if obj.hidden}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path
                  d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                ></path><line x1="1" y1="1" x2="23" y2="23"></line></svg
              >
            {:else}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                ></path><circle cx="12" cy="12" r="3"></circle></svg
              >
            {/if}
          </button>

          <button
            class="icon-btn {obj.locked ? 'active' : ''}"
            title="Toggle Lock"
            on:click|stopPropagation={() =>
              updateObject(obj.id, { locked: !obj.locked })}
          >
            {#if obj.locked}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                ></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg
              >
            {:else}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><rect x="3" y="11" width="18" height="11" rx="2" ry="2"
                ></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg
              >
            {/if}
          </button>
        </div>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="layer-name"
          role="textbox"
          tabindex="0"
          on:dblclick|stopPropagation={() => (editingId = obj.id)}
        >
          {#if editingId === obj.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              value={obj.name || ""}
              autofocus
              on:blur={(e) => {
                updateObject(obj.id, { name: e.currentTarget.value });
                editingId = null;
              }}
              on:keydown={(e) => {
                if (e.key === "Enter") {
                  updateObject(obj.id, { name: e.currentTarget.value });
                  editingId = null;
                } else if (e.key === "Escape") {
                  editingId = null;
                }
              }}
              on:mousedown|stopPropagation
            />
          {:else}
            <span>{getObjectLabel(obj)}</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .layers-panel {
    position: fixed;
    top: 40px;
    right: 260px;
    width: 190px;
    height: calc(100vh - 40px);
    background: #1a1a1a;
    border-left: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    z-index: 50;
    font-size: 12px;
  }

  .header {
    padding: 6px 10px;
    border-bottom: 1px solid #2a2a2a;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
  }

  .layer-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .layer-item {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 5px;
    cursor: default;
    border-radius: 3px;
    margin: 1px 3px;
    transition: background 0.1s;
    user-select: none;
    touch-action: none;
    border: 1px solid transparent;
  }

  .layer-item:hover {
    background: #252525;
  }

  .layer-item.selected {
    background: #1e3a5f;
  }

  .layer-item.drag-over {
    border-top: 2px solid #4a9eff;
  }

  .layer-item.dragging {
    opacity: 0.35;
  }

  .drag-handle {
    cursor: grab;
    color: #666;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 2px 1px;
    border-radius: 2px;
  }

  .drag-handle:hover {
    color: #aaa;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .layer-controls {
    display: flex;
    gap: 1px;
    flex-shrink: 0;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    border-radius: 2px;
    color: #555;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.1s;
  }

  .icon-btn:hover {
    color: #ccc;
    background: #333;
  }

  .icon-btn.active {
    color: #4a9eff;
  }

  .layer-name {
    flex: 1;
    overflow: hidden;
    min-width: 0;
    cursor: default;
  }

  .layer-name span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    color: #bbb;
    font-size: 11px;
  }

  .layer-name input {
    width: 100%;
    background: #2a2a2a;
    border: 1px solid #4a9eff;
    border-radius: 2px;
    color: #fff;
    font-size: 11px;
    padding: 1px 4px;
    outline: none;
  }
</style>
