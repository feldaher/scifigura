<script lang="ts">
  import type { ValidationIssue } from "../types";

  let {
    issues = [],
    onSelect,
  }: { issues: ValidationIssue[]; onSelect: (id: string) => void } = $props();

  let isExpanded = $state(true);
</script>

{#if issues.length > 0}
  <div class="validation-panel {isExpanded ? 'expanded' : 'collapsed'}">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="header" onclick={() => isExpanded = !isExpanded} title={isExpanded ? "Collapse warnings" : "Show journal warnings"}>
      <div class="header-left">
        <svg class="chevron" class:open={isExpanded} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
        {#if isExpanded}
          <h4>Journal Validation</h4>
        {/if}
      </div>
      <span class="badge {issues.some((i) => i.type === 'error') ? 'error' : 'warning'}">
        {#if isExpanded}
          {issues.length} {issues.length === 1 ? 'Issue' : 'Issues'}
        {:else}
          {issues.length}
        {/if}
      </span>
    </div>
    
    {#if isExpanded}
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
    {/if}
  </div>
{/if}

<style>
  .validation-panel {
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: #1e1e1e;
    border: 1px solid #333;
    color: #e0e0e0;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    transition: width 0.2s, border-radius 0.2s;
  }

  .validation-panel.expanded {
    width: 320px;
    max-height: 250px;
    border-radius: 8px;
  }

  .validation-panel.collapsed {
    width: auto;
    border-radius: 20px;
    background: #2a2a2a;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 15px;
    background: #2a2a2a;
    border-radius: 8px 8px 0 0;
    cursor: pointer;
    user-select: none;
    gap: 10px;
  }

  .validation-panel.expanded .header {
    border-bottom: 1px solid #444;
  }

  .validation-panel.collapsed .header {
    border-radius: 20px;
    padding: 6px 12px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chevron {
    transition: transform 0.2s;
    color: #888;
  }
  .chevron.open {
    transform: rotate(180deg);
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
