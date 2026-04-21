<script lang="ts">
  import type { ValidationIssue } from "../types";

  let {
    issues = [],
    onSelect,
  }: { issues: ValidationIssue[]; onSelect: (id: string) => void } = $props();
</script>

{#if issues.length > 0}
  <div class="validation-panel">
    <div class="header">
      <h4>Journal Validation</h4>
      <span class="badge {issues.some((i) => i.type === 'error') ? 'error' : 'warning'}">
        {issues.length} {issues.length === 1 ? 'Issue' : 'Issues'}
      </span>
    </div>
    <ul class="issue-list">
      {#each issues as issue (issue.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <li class="issue-item {issue.type}" onclick={() => onSelect(issue.objectId)}>
          <span class="icon">{issue.type === "error" ? "❌" : "⚠️"}</span>
          <span class="message">{issue.message}</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .validation-panel {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 8px;
    color: #e0e0e0;
    width: 320px;
    max-height: 250px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    background: #2a2a2a;
    border-radius: 8px 8px 0 0;
    border-bottom: 1px solid #444;
  }

  h4 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #bbb;
  }

  .badge {
    font-size: 11px;
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

  .issue-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }

  .issue-item {
    padding: 12px 15px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    border-bottom: 1px solid #333;
    transition: background 0.15s;
  }

  .issue-item:hover {
    background: #2d2d2d;
  }

  .issue-item:last-child {
    border-bottom: none;
  }

  .icon {
    font-size: 14px;
    margin-top: 1px;
  }

  .message {
    font-size: 13px;
    line-height: 1.4;
  }

  .error .message {
    color: #ff5252;
  }

  .warning .message {
    color: #ffca28;
  }
</style>
