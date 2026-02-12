<script lang="ts">
  import Canvas from "$lib/components/Canvas.svelte";
</script>

<main>
  <Canvas />
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden; /* Prevent native scrollbars */
    background: #1e1e1e;
  }

  main {
    width: 100vw;
    height: 100vh;
  }
</style>
