<script lang="ts">
  // @ts-nocheck
  import { watchlist } from '../store/watchlistStore';
  import parseWatchlist, { ParsedEntry } from '../lib/parseWatchlist';

  let parsedEntries: ParsedEntry[] = [];
  let selected: Record<string, boolean> = {};

  type DisplayEntry = { symbol: string; category: string };
  let displayEntries: DisplayEntry[] = [];

  $: displayEntries = parsedEntries.map(e => ({ symbol: e.symbol, category: e.category }));

  async function handleUpload(file: File | null) {
    if (!file) return;
    const text = await file.text();
    console.debug('📄 Raw file content:', text);

    parsedEntries = parseWatchlist(text);
    console.debug('✅ Parsed entries:', parsedEntries);

    // auto-select all parsed symbols
    selected = {};
    parsedEntries.forEach((entry) => {
      selected[entry.symbol] = true;
    });
    console.debug('Selected symbols pre-import:', Object.keys(selected));
  }

  // wrapper handlers used in template to avoid inline blocks
  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files && input.files[0] ? input.files[0] : null;
    handleUpload(file);
  }

  function onToggleSelectAll(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    toggleSelectAll(checked);
  }

  function onEntryChange(e: Event, symbol: string) {
    selected[symbol] = (e.target as HTMLInputElement).checked;
  }

  function toggleSelectAll(checked: boolean) {
    parsedEntries.forEach((entry) => {
      selected[entry.symbol] = checked;
    });
  }

  function importSelectedSymbols() {
    const selectedSymbols = parsedEntries
      .filter((entry) => selected[entry.symbol])
      .map((entry) => entry.symbol);

    console.debug('Importing symbols:', selectedSymbols);

    watchlist.addSymbols(selectedSymbols);
  }
</script>

<style>
  .modal {
    padding: 1rem;
    background: #f9f9f9;
    border: 1px solid #ccc;
    border-radius: 6px;
    width: 500px;
  }
  .entry-list {
    margin-top: 1rem;
    max-height: 300px;
    overflow-y: auto;
  }
  label {
    display: block;
    margin-bottom: 0.5rem;
  }
</style>

<div class="modal">
  <h3>📥 Import Watchlist</h3>

  <input type="file" accept=".txt" on:change={onFileChange} />

  {#if parsedEntries.length > 0}
    <label>
      <input type="checkbox" on:change={onToggleSelectAll} />
      Select All
    </label>

    <div class="entry-list">
      {#each displayEntries as entry}
        <label>
          <input
            type="checkbox"
            checked={!!selected[entry.symbol]}
            on:change={(e) => onEntryChange(e, entry.symbol)}
          />
          {entry.symbol} ({entry.category})
        </label>
      {/each}
    </div>

    <button on:click={importSelectedSymbols} disabled={parsedEntries.every((entry) => !selected[entry.symbol])}>
      Import ({parsedEntries.filter((entry) => selected[entry.symbol]).length} selected)
    </button>
  {:else}
    <p>No entries found. Please upload a valid .txt file.</p>
  {/if}
</div>