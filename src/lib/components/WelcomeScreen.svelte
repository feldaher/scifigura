<script lang="ts">
  let {
    onNew,
    onOpen,
    onImport,
  }: {
    onNew?: () => void;
    onOpen?: () => void;
    onImport?: () => void;
  } = $props();
</script>

<div class="welcome-backdrop">
  <div class="welcome-panel">
    <!-- Branding -->
    <div class="brand">
      <div class="logo-mark">
        <!-- App icon -->
        <img src="/app-icon.png" alt="SciFigura" width="40" height="40" style="border-radius: 8px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));" />
      </div>
      <div class="brand-text">
        <h1>SciFigura</h1>
        <span class="version">v0.1.0</span>
      </div>
    </div>

    <p class="tagline">Scientific figures, reimagined.</p>

    <!-- Action cards -->
    <div class="actions">
      <button class="action-card primary" onclick={onNew}>
        <div class="action-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </div>
        <div class="action-info">
          <span class="action-title">New Figure</span>
          <span class="action-sub">Start with a blank canvas</span>
        </div>
        <kbd>Ctrl+N</kbd>
      </button>

      <button class="action-card" onclick={onOpen}>
        <div class="action-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            />
          </svg>
        </div>
        <div class="action-info">
          <span class="action-title">Open Project</span>
          <span class="action-sub">Load a saved .sfs or .json file</span>
        </div>
        <kbd>Ctrl+O</kbd>
      </button>

      <button class="action-card" onclick={onImport}>
        <div class="action-icon">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <div class="action-info">
          <span class="action-title">Import Image</span>
          <span class="action-sub">Bring in a micrograph or photo</span>
        </div>
      </button>
    </div>

    <!-- Hint strip -->
    <p class="hint">
      Press <kbd>?</kbd> at any time for the keyboard shortcut cheatsheet
    </p>
  </div>
</div>

<style>
  .welcome-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(18, 18, 22, 0.92);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 500;
    animation: fade-in 0.25s ease;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .welcome-panel {
    background: #1c1c24;
    border: 1px solid #2e2e3e;
    border-radius: 14px;
    padding: 36px 40px 28px;
    width: 420px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Brand ──────────────────────────── */
  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 8px;
  }

  .logo-mark {
    flex-shrink: 0;
    filter: drop-shadow(0 4px 12px rgba(37, 99, 235, 0.4));
  }

  .brand-text {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    color: #f0f0f8;
    letter-spacing: -0.5px;
    font-family: system-ui, sans-serif;
  }

  .version {
    font-size: 11px;
    color: #4a4a5a;
    font-family: monospace;
    background: #25252f;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid #333;
  }

  .tagline {
    margin: 0 0 24px 0;
    color: #555568;
    font-size: 13px;
    font-family: system-ui, sans-serif;
    padding-left: 54px; /* align with brand text */
  }

  /* ── Action cards ───────────────────── */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
  }

  .action-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: #22222e;
    border: 1px solid #2e2e3e;
    border-radius: 8px;
    padding: 13px 16px;
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
    text-align: left;
    color: inherit;
    width: 100%;
  }

  .action-card:hover {
    background: #292938;
    border-color: #3e3e54;
    transform: translateX(2px);
  }

  .action-card.primary {
    border-color: #2a4a9a;
    background: linear-gradient(135deg, #1a2a5e 0%, #1d2a50 100%);
  }

  .action-card.primary:hover {
    border-color: #3a6adf;
    background: linear-gradient(135deg, #1e3070 0%, #1f3060 100%);
  }

  .action-icon {
    width: 40px;
    height: 40px;
    background: #2a2a3a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: #778;
  }

  .action-card.primary .action-icon {
    background: rgba(37, 99, 235, 0.25);
    color: #7aa9ff;
  }

  .action-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .action-title {
    font-size: 13px;
    font-weight: 600;
    color: #d0d0e0;
    font-family: system-ui, sans-serif;
  }

  .action-sub {
    font-size: 11px;
    color: #50505e;
    font-family: system-ui, sans-serif;
  }

  .action-card kbd {
    font-family: monospace;
    font-size: 10px;
    color: #3a3a50;
    background: #1a1a28;
    border: 1px solid #2e2e42;
    border-bottom-width: 2px;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Hint ───────────────────────────── */
  .hint {
    margin: 0;
    text-align: center;
    font-size: 11px;
    color: #38383a;
    font-family: system-ui, sans-serif;
  }

  .hint kbd {
    font-family: monospace;
    color: #484858;
    background: #1e1e28;
    border: 1px solid #2e2e3e;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 11px;
  }
</style>
