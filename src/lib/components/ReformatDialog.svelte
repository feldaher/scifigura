<script lang="ts">
  let {
    isOpen = false,
    fromLabel = "",
    toLabel = "",
    onScale,
    onReflow,
    onCancel,
  }: {
    isOpen: boolean;
    fromLabel: string;
    toLabel: string;
    onScale: () => void;
    onReflow: () => void;
    onCancel: () => void;
  } = $props();
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={onCancel}>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <h3>Change Canvas Size</h3>
      <p class="subtitle">
        Switching from <strong>{fromLabel}</strong> to
        <strong>{toLabel}</strong>.
      </p>
      <p class="desc">How should existing objects be handled?</p>

      <div class="actions">
        <button class="btn-primary" onclick={onScale}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          Scale proportionally
          <span class="hint">Resize all objects to match the new canvas</span>
        </button>

        <button class="btn-reflow" onclick={onReflow}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          Reflow layout
          <span class="hint"
            >Rearrange panels into an optimal grid for the new size</span
          >
        </button>

        <button class="btn-cancel" onclick={onCancel}>Keep current size</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    background: #1e1e28;
    border: 1px solid #2e2e3e;
    border-radius: 12px;
    padding: 28px 32px;
    width: 420px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
  }

  h3 {
    margin: 0 0 8px;
    font-size: 16px;
    color: #e8e8f0;
    font-weight: 600;
  }

  .subtitle {
    margin: 0 0 4px;
    font-size: 13px;
    color: #888;
  }

  .desc {
    margin: 0 0 20px;
    font-size: 12px;
    color: #555;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    transition:
      background 0.15s,
      border-color 0.15s;
  }

  button svg {
    width: 16px;
    height: 16px;
    margin-bottom: 4px;
  }

  .hint {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.65;
  }

  .btn-primary {
    background: #1e3a6e;
    border-color: #3a5aae;
    color: #c8d8ff;
  }
  .btn-primary:hover {
    background: #2a4a8e;
    border-color: #5a7adf;
  }

  .btn-reflow {
    background: #1a3a2a;
    border-color: #2a6a4a;
    color: #a0e0c0;
  }
  .btn-reflow:hover {
    background: #235042;
    border-color: #3a9a6a;
  }

  .btn-cancel {
    background: transparent;
    border-color: #2a2a3a;
    color: #555;
    font-size: 12px;
    padding: 8px 16px;
    align-items: center;
  }
  .btn-cancel:hover {
    color: #888;
    border-color: #3a3a4a;
  }
</style>
