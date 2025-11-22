<script lang="ts">
  // lightweight local writable implementation to avoid importing 'svelte/store'
  function writable<T>(initial: T) {
    let value = initial;
    const subscribers: Array<(v: T) => void> = [];

    return {
      subscribe(run: (v: T) => void) {
        run(value);
        subscribers.push(run);
        return () => {
          const i = subscribers.indexOf(run);
          if (i !== -1) subscribers.splice(i, 1);
        };
      },
      set(v: T) {
        value = v;
        subscribers.forEach(s => s(value));
      },
      update(fn: (v: T) => T) {
        value = fn(value);
        subscribers.forEach(s => s(value));
      }
    };
  }

  const watchlist = writable<string[]>([]);
</script>

<h2>Watchlist</h2>

{#if $watchlist.length === 0}
  <p>No symbols imported yet.</p>
{:else}
  <ul>
    {#each $watchlist as symbol}
      <li>{symbol}</li>
    {/each}
  </ul>
{/if}
