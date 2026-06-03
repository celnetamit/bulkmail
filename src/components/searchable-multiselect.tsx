'use client';

import React, { useEffect, useRef, useState } from 'react';

type List = { id: string; name: string; isDefaultTestList?: number | boolean };

type Props = {
  lists: List[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
};

export default function SearchableMultiSelect({ lists, selectedIds, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const filtered = lists.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: string) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((s) => s !== id));
    else onChange([...selectedIds, id]);
  }

  const selectedCount = selectedIds.length;
  const displayText = selectedCount === 0 ? (placeholder || 'Select lists...') : `${selectedCount} selected`;

  return (
    <div className="searchable-multiselect" ref={ref}>
      <div className="searchable-multiselect__control" onClick={() => setOpen((s) => !s)} role="button">
        <div className="searchable-multiselect__value">{displayText}</div>
        <div className="searchable-multiselect__chev">{open ? '▴' : '▾'}</div>
      </div>

      {open ? (
        <div className="searchable-multiselect__menu">
          <input
            className="searchable-multiselect__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lists..."
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="form-note">No lists match your search.</div>
          ) : (
            filtered.map((l) => {
              const sel = selectedIds.includes(l.id);
              return (
                <div
                  key={l.id}
                  className={`searchable-multiselect__item ${sel ? 'searchable-multiselect__item--selected' : ''}`}
                  onClick={() => toggle(l.id)}
                >
                  <input type="checkbox" checked={sel} readOnly />
                  <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <span style={{ minWidth: 0 }}>{l.name}</span>
                    {l.isDefaultTestList ? <span className="badge badge-success">Test list</span> : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
