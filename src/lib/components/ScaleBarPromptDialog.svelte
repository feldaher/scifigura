<script lang="ts">
  let {
    isOpen = false,
    imageWidth = 0,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    imageWidth: number;
    onConfirm: (
      physicalLength: number,
      pixelSize: number,
      units: string,
    ) => void;
    onCancel: () => void;
  } = $props();

  let physicalLength = $state(10);
  let pixelSize = $state(1.0);
  let units = $state("µm");

  // Reset when opened
  $effect(() => {
    if (isOpen) {
      physicalLength = 10;
      pixelSize = 1.0;
      units = "µm";
    }
  });

  function handleSuggestLength() {
    // Suggest length that is roughly 15% of the image width
    if (imageWidth > 0 && pixelSize > 0) {
      const physicalWidth = imageWidth * pixelSize;
      const targetLength = physicalWidth * 0.15;

      // Round to 1 significant digit
      const magnitude = Math.pow(10, Math.floor(Math.log10(targetLength)));
      const rounded = Math.round(targetLength / magnitude) * magnitude;

      physicalLength = rounded > 0 ? rounded : 1;
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (physicalLength > 0 && pixelSize > 0) {
      onConfirm(physicalLength, pixelSize, units);
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={onCancel}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="modal-content"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <h2>Add Scale Bar</h2>

      <form onsubmit={handleSubmit}>
        <div class="form-group">
          <label for="pixel-size">Pixel Size (units/pixel):</label>
          <div class="input-row">
            <input
              type="number"
              id="pixel-size"
              bind:value={pixelSize}
              step="any"
              min="0.000000000000001"
              required
            />
            <select bind:value={units}>
              <option value="nm">nm</option>
              <option value="µm">µm</option>
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="px">px</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="physical-length"
            >Desired Scale Bar Length ({units}):</label
          >
          <div class="input-row">
            <input
              type="number"
              id="physical-length"
              bind:value={physicalLength}
              step="any"
              min="0"
              required
            />
            <button
              type="button"
              class="btn-secondary"
              onclick={handleSuggestLength}
              disabled={imageWidth === 0 || pixelSize <= 0}
            >
              Suggest Length
            </button>
          </div>
          <small
            >The scale bar will be {Math.round(physicalLength / pixelSize)} pixels
            wide.</small
          >
        </div>

        <div class="button-group">
          <button type="button" class="btn-cancel" onclick={onCancel}
            >Cancel</button
          >
          <button type="submit" class="btn-primary">Add Scale Bar</button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  }

  .modal-content {
    background: #252525;
    padding: 24px;
    border-radius: 8px;
    width: 400px;
    max-width: 90vw;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid #333;
    color: #eee;
  }

  h2 {
    margin-top: 0;
    margin-bottom: 20px;
    font-size: 18px;
    font-weight: 500;
  }

  .form-group {
    margin-bottom: 16px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 13px;
    color: #bbb;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  input,
  select {
    background: #1e1e1e;
    border: 1px solid #444;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 14px;
  }

  input[type="number"] {
    flex: 1;
    width: 60px;
  }

  small {
    display: block;
    margin-top: 6px;
    color: #888;
    font-size: 12px;
  }

  .button-group {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  button {
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    border: none;
  }

  .btn-cancel {
    background: transparent;
    color: #bbb;
  }
  .btn-cancel:hover {
    color: #fff;
    background: #333;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }
  .btn-primary:hover {
    background: #0056b3;
  }

  .btn-secondary {
    background: #333;
    color: #ddd;
    border: 1px solid #444;
  }
  .btn-secondary:hover:not(:disabled) {
    background: #444;
  }
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
