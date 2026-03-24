<script lang="ts">
  import type { CustomPreset } from "../utils/presets";

  let {
    isOpen = false,
    presets = [],
    onSave,
    onCancel,
  }: {
    isOpen: boolean;
    presets: CustomPreset[];
    onSave: (newPresets: CustomPreset[]) => void;
    onCancel: () => void;
  } = $props();

  // Local mutable copy of presets
  let localPresets = $state<CustomPreset[]>([]);

  // Sync when dialog opens
  $effect(() => {
    if (isOpen) {
      localPresets = JSON.parse(JSON.stringify(presets));
      editingId = null;
    }
  });

  // State for the form
  let editingId = $state<string | null>(null);
  let formLabel = $state("");
  let formW = $state(800);
  let formH = $state(600);
  let formMinFont = $state<number | "">("");

  function startEdit(preset: CustomPreset) {
    editingId = preset.key;
    formLabel = preset.label;
    formW = preset.w;
    formH = preset.h;
    formMinFont = preset.minFontSizePt ?? "";
  }

  function startNew() {
    editingId = "new";
    formLabel = "My Custom Journal";
    formW = 800;
    formH = 600;
    formMinFont = "";
  }

  function cancelEdit() {
    editingId = null;
  }

  function saveEdit() {
    if (!formLabel.trim() || formW <= 0 || formH <= 0) return;

    const newPreset: CustomPreset = {
      key: editingId === "new" ? `custom_${Date.now()}` : (editingId as string),
      label: formLabel.trim(),
      w: formW,
      h: formH,
    };

    if (typeof formMinFont === "number" && formMinFont > 0) {
      newPreset.minFontSizePt = formMinFont;
    }

    if (editingId === "new") {
      localPresets = [...localPresets, newPreset];
    } else {
      localPresets = localPresets.map((p) =>
        p.key === editingId ? newPreset : p,
      );
    }
    editingId = null;
  }

  function deletePreset(key: string) {
    localPresets = localPresets.filter((p) => p.key !== key);
  }

  function handleSaveAll() {
    onSave(localPresets);
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={onCancel}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="header">
        <h2>Manage Custom Presets</h2>
        <button class="btn-icon" onclick={onCancel}>✕</button>
      </div>

      <div class="preset-list">
        {#if localPresets.length === 0}
          <div class="empty-state">No custom presets yet.</div>
        {:else}
          {#each localPresets as preset}
            <div class="preset-item">
              <div class="preset-info">
                <strong>{preset.label}</strong>
                <span class="dim">{preset.w} × {preset.h} px</span>
                {#if preset.minFontSizePt}
                  <span class="dim">| Min font: {preset.minFontSizePt}pt</span>
                {/if}
              </div>
              <div class="preset-actions">
                <button class="btn-text" onclick={() => startEdit(preset)}
                  >Edit</button
                >
                <button
                  class="btn-text danger"
                  onclick={() => deletePreset(preset.key)}>Delete</button
                >
              </div>
            </div>
          {/each}
        {/if}
      </div>

      {#if editingId}
        <div class="edit-form">
          <h3>{editingId === "new" ? "Create Preset" : "Edit Preset"}</h3>

          <div class="form-row">
            <label
              >Name
              <input
                type="text"
                bind:value={formLabel}
                placeholder="e.g. My Open Access Journal"
              />
            </label>
          </div>

          <div class="form-row halves">
            <label
              >Width (px)
              <input type="number" bind:value={formW} min="1" />
            </label>
            <label
              >Height (px)
              <input type="number" bind:value={formH} min="1" />
            </label>
          </div>

          <div class="form-row">
            <label
              >Minimum Font Size (pt) <span class="opt">(Optional)</span>
              <input
                type="number"
                bind:value={formMinFont}
                min="1"
                placeholder="e.g. 7"
              />
            </label>
          </div>

          <div class="form-actions">
            <button class="btn-secondary" onclick={cancelEdit}>Cancel</button>
            <button
              class="btn-primary"
              onclick={saveEdit}
              disabled={!formLabel || formW <= 0 || formH <= 0}>Save</button
            >
          </div>
        </div>
      {:else}
        <button class="btn-dashed" onclick={startNew}>+ Add New Preset</button>
      {/if}

      <div class="dialog-actions">
        <button class="btn-secondary" onclick={onCancel}>Cancel</button>
        <button class="btn-primary" onclick={handleSaveAll}>Save & Close</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-content {
    background: #1e1e28;
    border: 1px solid #2e2e3e;
    border-radius: 12px;
    padding: 24px 28px;
    width: 480px;
    max-width: 90vw;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    color: #e8e8f0;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 14px;
    color: #a0a0b0;
  }

  .btn-icon {
    background: transparent;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
  }
  .btn-icon:hover {
    color: #fff;
  }

  .preset-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 16px;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #666;
    font-style: italic;
    background: #181820;
    border-radius: 8px;
    border: 1px dashed #334;
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #252532;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid #333344;
  }

  .preset-info strong {
    display: block;
    margin-bottom: 4px;
    font-size: 14px;
  }

  .preset-info .dim {
    color: #888;
    font-size: 12px;
  }

  .preset-actions {
    display: flex;
    gap: 8px;
  }

  .btn-text {
    background: transparent;
    border: none;
    color: #88b0ff;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
  }
  .btn-text:hover {
    text-decoration: underline;
  }
  .btn-text.danger {
    color: #ff6b6b;
  }

  .btn-dashed {
    background: transparent;
    border: 1px dashed #445;
    color: #a0a0b0;
    padding: 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }
  .btn-dashed:hover {
    background: #252532;
    border-color: #667;
    color: #fff;
  }

  .edit-form {
    background: #181820;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid #2e2e3e;
    margin-bottom: 16px;
  }

  .form-row {
    margin-bottom: 12px;
  }
  .form-row.halves {
    display: flex;
    gap: 12px;
  }
  .form-row.halves > label {
    flex: 1;
  }

  .form-row label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
    color: #a0a0b0;
  }

  .form-row .opt {
    opacity: 0.6;
    font-style: italic;
  }

  input[type="text"],
  input[type="number"] {
    background: #252532;
    border: 1px solid #3e3e4e;
    color: #fff;
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 14px;
  }
  input:focus {
    border-color: #5a7adf;
    outline: none;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid #2e2e3e;
  }

  .btn-primary,
  .btn-secondary {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }

  .btn-primary {
    background: #1e3a6e;
    border-color: #3a5aae;
    color: #c8d8ff;
  }
  .btn-primary:hover:not(:disabled) {
    background: #2a4a8e;
  }
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    border-color: #3e3e4e;
    color: #a0a0b0;
  }
  .btn-secondary:hover {
    background: #252532;
    color: #fff;
  }
</style>
