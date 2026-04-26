import React from 'react';

export default function FilterBar({
  types,
  activeType,
  onTypeChange,
  filterText,
  onFilterTextChange,
}) {
  return (
    <div className="filter-bar">
      {types.map((t) => (
        <button
          key={t}
          className={'filter-chip ' + (t === activeType ? 'active' : '')}
          onClick={() => onTypeChange(t)}
        >
          {t === 'all' ? 'All' : t}
        </button>
      ))}
      <input
        type="text"
        className="filter-search"
        placeholder="Filter URL…"
        value={filterText}
        onChange={(e) => onFilterTextChange(e.target.value)}
      />
    </div>
  );
}
