import React from 'react';

const ITEMS = [
  { id: 'tag-inventory', label: 'Tag Inventory', icon: '◧' },
  { id: 'automation-testing', label: 'Automation Testing', icon: '✓' },
];

export default function OpSidebar({ activeNav, onNavChange }) {
  return (
    <div className="op-sidebar">
      <div className="op-sidebar-section">
        {ITEMS.map((item) => {
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              className={'op-sidebar-item' + (active ? ' active' : '')}
              onClick={() => onNavChange(item.id)}
            >
              <span className="op-sidebar-icon">{item.icon}</span>
              <span className="op-sidebar-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
