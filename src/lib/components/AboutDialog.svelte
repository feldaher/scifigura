<script lang="ts">
  let { show = $bindable(false) }: { show: boolean } = $props();

  function close() {
    show = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div class="backdrop" onclick={close} role="button" tabindex="-1">
    <div
      class="dialog"
      onclick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <button class="close-btn" onclick={close} aria-label="Close">×</button>

      <!-- Logo + name -->
      <div class="header">
        <div class="logo-mark">
          <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
            <rect
              x="2"
              y="2"
              width="36"
              height="36"
              rx="8"
              fill="url(#agrad)"
            />
            <rect
              x="12"
              y="8"
              width="6"
              height="14"
              rx="2"
              fill="white"
              fill-opacity="0.9"
            />
            <rect
              x="10"
              y="20"
              width="10"
              height="3"
              rx="1.5"
              fill="white"
              fill-opacity="0.7"
            />
            <line
              x1="15"
              y1="23"
              x2="15"
              y2="30"
              stroke="white"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <line
              x1="10"
              y1="30"
              x2="20"
              y2="30"
              stroke="white"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <circle
              cx="27"
              cy="15"
              r="6"
              stroke="white"
              stroke-width="2"
              fill="none"
              stroke-opacity="0.85"
            />
            <line
              x1="31.2"
              y1="19.2"
              x2="35"
              y2="23"
              stroke="white"
              stroke-width="2.5"
              stroke-linecap="round"
            />
            <defs>
              <linearGradient
                id="agrad"
                x1="0"
                y1="0"
                x2="40"
                y2="40"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stop-color="#2563eb" />
                <stop offset="100%" stop-color="#1e40af" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <h2>SciFigura</h2>
          <span class="version">Version 0.1.0</span>
        </div>
      </div>

      <p class="desc">
        A lightweight, open-source desktop application for creating
        publication-ready scientific figures — annotations, scale bars, panel
        labels and more.
      </p>

      <div class="meta">
        <div class="meta-row">
          <span class="meta-label">License</span>
          <span>MIT</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Built with</span>
          <span>Tauri · Svelte · TypeScript</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">Source</span>
          <a
            href="https://github.com/feldaher/scifigura"
            target="_blank"
            rel="noopener noreferrer">github.com/feldaher/scifigura</a
          >
        </div>
      </div>

      <div class="footer">
        <button class="btn-primary" onclick={close}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 4000;
    animation: fade-in 0.15s ease;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .dialog {
    position: relative;
    background: #1c1c24;
    border: 1px solid #2e2e3e;
    border-radius: 12px;
    padding: 32px 32px 24px;
    width: 380px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
    animation: slide-up 0.18s ease;
  }

  @keyframes slide-up {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .close-btn {
    position: absolute;
    top: 14px;
    right: 16px;
    background: transparent;
    border: none;
    color: #444;
    font-size: 22px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: color 0.1s;
  }
  .close-btn:hover {
    color: #aaa;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .logo-mark {
    filter: drop-shadow(0 4px 12px rgba(37, 99, 235, 0.35));
    flex-shrink: 0;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
    color: #f0f0f8;
    font-family: system-ui, sans-serif;
    letter-spacing: -0.3px;
  }

  .version {
    font-size: 11px;
    color: #4a4a5a;
    font-family: monospace;
    background: #25252f;
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid #333;
  }

  .desc {
    font-size: 12.5px;
    line-height: 1.6;
    color: #666680;
    margin: 0 0 20px;
    font-family: system-ui, sans-serif;
  }

  .meta {
    background: #17171f;
    border: 1px solid #252530;
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .meta-row {
    display: flex;
    gap: 12px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    color: #888;
  }

  .meta-label {
    color: #3a3a4a;
    width: 70px;
    flex-shrink: 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-top: 1px;
  }

  a {
    color: #5aabff;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-primary {
    background: #2563eb;
    border: none;
    color: white;
    padding: 7px 20px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    font-family: system-ui, sans-serif;
    transition: background 0.15s;
  }
  .btn-primary:hover {
    background: #1d4ed8;
  }
</style>
