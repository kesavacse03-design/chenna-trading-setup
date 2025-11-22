import { useState, useEffect } from 'react';

type Suggestion = {
  symbol: string;
  trading_symbol: string;
  instrument_token: string;
  exchange: string;
  name: string;
};

type Props = {
  value: string;
  onSelect: (suggestion: Suggestion) => void;
  onInvalid: () => void;
};

const AutocompleteInput = ({ value, onSelect, onInvalid }: Props) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const id = setTimeout(async () => {
      if (query.length < 2) return;
      setLoading(true);
      try {
        const resp = await fetch('/api/import/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, limit: 10 })
        });
        if (!resp.ok) throw new Error('Network response was not ok');
        const data = (await resp.json()) as Suggestion[];
        setSuggestions(data || []);
      } catch (e) {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(id);
  }, [query]);

  const handleSelect = (s: Suggestion) => {
    setQuery(s.symbol);
    setShowDropdown(false);
    onSelect(s);
  };

  return (
    <div className="autocomplete">
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setShowDropdown(true);
          onInvalid(); // reset validation until selection
        }}
      />
      {loading && <div className="spinner">Loading...</div>}
      {showDropdown && suggestions.length > 0 && (
        <ul className="dropdown">
          {suggestions.map((s, idx) => (
            <li key={idx} onClick={() => handleSelect(s)}>
              {s.symbol} — {s.name} ({s.exchange})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteInput;