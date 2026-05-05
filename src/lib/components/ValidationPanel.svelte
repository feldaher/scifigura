<script lang="ts">
  import type { ValidationIssue } from "../types";

  let {
    issues = [],
    onSelect,
    onDismiss,
    onDismissAll
  }: { 
    issues: ValidationIssue[]; 
    onSelect: (id: string) => void;
    onDismiss: (id: string) => void;
    onDismissAll: () => void;
  } = $props();
</script>

<div class="validation-dropdown">
  <div class="header">
    <div class="header-left">
      <h4>Journal Validation</h4>
      <span class="badge {issues.some((i) => i.type === 'error') ? 'error' : 'warning'}">
        {issues.length} {issues.length === 1 ? 'Issue' : 'Issues'}
      </span>
    </div>
    {#if issues.length > 0}
      <button class="dismiss-all-btn" onclick={onDismissAll} title="Dismiss all issues">
        Clear All
      </button>
    {/if}
  </div>
  
  {#if issues.length === 0}
    <div class="empty-state">
      No validation issues.
    </div>
  {:else}
    <ul class="issue-list">
      {#each issues as issue (issue.id)}
        <li class="issue-item {issue.type}">
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="issue-content" onclick={() => onSelect(issue.objectId)}>
            <span class="icon">{issue.type === "error" ? "❌" : "⚠️"}</span>
            <span class="message">{issue.message}</span>
          </div>
          <button class="dismiss-btn" onclick={(e) => { e.stopPropagation(); onDismiss(issue.id); }} title="Dismiss issue">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .validation-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 340px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    z-index: 10000;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #2a2a2a;
    border-radius: 6px 6px 0 0;
    border-bottom: 1px solid #444;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h4 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #bbb;
  }

  .badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 12px;
    font-weight: bold;
  }
  .badge.error {
    background: rgba(244, 67, 54, 0.2);
    color: #f44336;
  }
  .badge.warning {
    background: rgba(255, 193, 7, 0.2);
    color: #ffc107;
  }

  .dismiss-all-btn {
    background: transparent;
    border: 1px solid #555;
    color: #aaa;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .dismiss-all-btn:hover {
    background: #444;
    color: #fff;
  }

  .empty-state {
    padding: 20px;
    text-align: center;
    color: #888;
    font-size: 12px;
  }

  .issue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
  }

  .issue-item {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid #333;
    transition: background 0.15s;
  }

  .issue-item:hover {
    background: #2d2d2d;
  }

  .issue-item:last-child {
    border-bottom: none;
  }

  .issue-content {
    flex: 1;
    padding: 10px 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
  }

  .icon {
    font-size: 14px;
    margin-top: 1px;
  }

  .message {
    font-size: 12px;
    line-height: 1.4;
  }

  .error .message {
    color: #ff5252;
  }

  .warning .message {
    color: #ffca28;
  }

  .dismiss-btn {
    background: transparent;
    border: none;
    color: #666;
    padding: 0 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
  }
  .dismiss-btn:hover {
    color: #f44336;
    background: rgba(244, 67, 54, 0.1);
  }
</style>
