'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

type List = { id: string; name: string; isDefaultTestList?: number | boolean };

type Props = {
  lists: List[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function SearchableMultiSelect({ lists, selectedIds, onChange, placeholder, disabled = false }: Props) {
  const listboxId = useId();
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

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => lists.filter((list) => list.name.toLowerCase().includes(normalizedQuery)),
    [lists, normalizedQuery],
  );
  const selectedItems = useMemo(
    () => selectedIds.map((id) => lists.find((list) => list.id === id)).filter((list): list is List => Boolean(list)),
    [lists, selectedIds],
  );

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) onChange(selectedIds.filter((s) => s !== id));
    else onChange([...selectedIds, id]);
  }

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setTimeout(() => searchRef.current?.focus(), 20);
  }

  return (
    <div className="searchable-multiselect" ref={ref}>
      <div
        className="searchable-multiselect__control"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) {
            setOpen(false);
            return;
          }
          openMenu();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            openMenu();
          }
          if (e.key === 'Backspace' && selectedIds.length > 0) {
            onChange(selectedIds.slice(0, -1));
          }
        }}
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div className="searchable-multiselect__value">
          {selectedItems.length > 0 ? (
            <div className="searchable-multiselect__tags">
              {selectedItems.map((item) => (
                  <span key={item.id} className="searchable-multiselect__tag">
                    <span className="searchable-multiselect__tag-label">{item.name}</span>
                      <button
                        type="button"
                        className="searchable-multiselect__tag-remove"
                        disabled={disabled}
                        onClick={(ev) => { ev.stopPropagation(); onChange(selectedIds.filter((s) => s !== item.id)); }}
                        aria-label={`Remove ${item.name}`}
                      >
                      ×
                    </button>
                  </span>
                ))}
            </div>
          ) : (
            <span className="searchable-multiselect__placeholder">{placeholder || 'Select lists...'}</span>
          )}
        </div>
        <div className="searchable-multiselect__chev">{open ? '▴' : '▾'}</div>
      </div>

      {open ? (
        <div className="searchable-multiselect__menu" id={listboxId}>
          <div className="searchable-multiselect__menu-head">
            <span>{selectedIds.length} selected</span>
            {selectedIds.length > 0 ? (
              <button type="button" className="searchable-multiselect__clear" onClick={() => onChange([])} disabled={disabled}>
                Clear
              </button>
            ) : null}
          </div>
          <input
            ref={searchRef}
            className="searchable-multiselect__search"
            value={query}
            disabled={disabled}
            onChange={(e) => { setQuery(e.target.value); setFocusedIndex(0); }}
            placeholder="Search lists..."
            onKeyDown={(e) => {
              if (disabled) return;
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
              if (e.key === 'Enter' && filtered[focusedIndex >= 0 ? focusedIndex : 0]) {
                e.preventDefault();
                toggle(filtered[focusedIndex >= 0 ? focusedIndex : 0].id);
              }
            }}
            autoFocus
          />
          {filtered.length === 0 ? (
            <div className="searchable-multiselect__empty">No lists match your search.</div>
          ) : (
            <div className="searchable-multiselect__list" role="listbox" aria-multiselectable="true">
              {filtered.map((l, idx) => {
                const sel = selectedIds.includes(l.id);
                return (
                  <div
                    key={l.id}
                    ref={(el) => { itemsRef.current[idx] = el; }}
                    tabIndex={0}
                    className={`searchable-multiselect__item ${sel ? 'searchable-multiselect__item--selected' : ''}`}
                    aria-disabled={disabled}
                    onClick={() => toggle(l.id)}
                    onKeyDown={(e) => {
                      if (disabled) return;
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
                        if (idx === 0) searchRef.current?.focus();
                        else itemsRef.current[prev]?.focus();
                      }
                      if (e.key === 'Escape') {
                        setOpen(false);
                      }
                    }}
                    role="option"
                    aria-selected={sel}
                  >
                    <input type="checkbox" checked={sel} readOnly />
                    <div className="searchable-multiselect__item-body">
                      <span className="searchable-multiselect__item-name">{l.name}</span>
                      {l.isDefaultTestList ? <span className="badge badge-success">Test list</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
