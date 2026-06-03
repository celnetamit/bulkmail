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
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const ref = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<Array<HTMLDivElement | null>>([]);

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
      <div
        className="searchable-multiselect__control"
        tabIndex={0}
        onClick={() => { setOpen((s) => !s); setTimeout(() => searchRef.current?.focus(), 20); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => searchRef.current?.focus(), 20);
          }
          if (e.key === 'Backspace' && query === '' && selectedIds.length > 0) {
            // remove last selected
            onChange(selectedIds.slice(0, -1));
          }
        }}
        role="button"
      >
        <div className="searchable-multiselect__value">
          {selectedIds.length > 0 ? (
            <div className="searchable-multiselect__tags">
              {selectedIds.map((id) => {
                const item = lists.find((l) => l.id === id);
                if (!item) return null;
                return (
                  <span key={id} className="searchable-multiselect__tag">
                    <span className="searchable-multiselect__tag-label">{item.name}</span>
                    <button
                      type="button"
                      className="searchable-multiselect__tag-remove"
                      onClick={(ev) => { ev.stopPropagation(); onChange(selectedIds.filter((s) => s !== id)); }}
                      aria-label={`Remove ${item.name}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="searchable-multiselect__placeholder">{placeholder || 'Select lists...'}</span>
          )}
        </div>
        <div className="searchable-multiselect__chev">{open ? '▴' : '▾'}</div>
      </div>

      {open ? (
        <div className="searchable-multiselect__menu">
          <input
            ref={searchRef}
            className="searchable-multiselect__search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocusedIndex(0); }}
            placeholder="Search lists..."
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex((i) => Math.min(i + 1, filtered.length - 1));
                itemsRef.current[Math.min(focusedIndex + 1, filtered.length - 1)]?.focus();
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex((i) => Math.max(i - 1, 0));
                itemsRef.current[Math.max(focusedIndex - 1, 0)]?.focus();
              }
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="form-note">No lists match your search.</div>
          ) : (
            filtered.map((l, idx) => {
              const sel = selectedIds.includes(l.id);
              return (
                <div
                  key={l.id}
                  ref={(el) => { itemsRef.current[idx] = el; }}
                  tabIndex={0}
                  className={`searchable-multiselect__item ${sel ? 'searchable-multiselect__item--selected' : ''}`}
                  onClick={() => toggle(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggle(l.id);
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next = Math.min(idx + 1, filtered.length - 1);
                      itemsRef.current[next]?.focus();
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prev = Math.max(idx - 1, 0);
                      itemsRef.current[prev]?.focus();
                    }
                    if (e.key === 'Escape') {
                      setOpen(false);
                    }
                  }}
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
