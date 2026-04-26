import React from 'react';

export default function Sidebar({ captures, activeCaptureId, onSelect, onDelete }) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Captures ({captures.length})</div>
      {captures.length === 0 && (
        <div style={{ padding: '20px 14px', color: 'var(--text-dim)', fontSize: 12 }}>
          No captures yet.
        </div>
      )}
      {captures.map((c) => (
        <div
          key={c.id}
          className={'capture-item ' + (c.id === activeCaptureId ? 'active' : '')}
          onClick={() => onSelect(c.id)}
        >
          <div className="capture-item-url" title={c.url}>{c.url}</div>
          <div className="capture-item-meta">
            <span>{formatTime(c.created_at)}</span>
            <span>
              {c.status === 'completed' ? (
                <>{c.request_count} req</>
              ) : c.status === 'failed' ? (
                <span className="status-failed">failed</span>
              ) : (
                c.status
              )}
            </span>
          </div>
          <button
            className="capture-item-delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this capture?')) onDelete(c.id);
            }}
            title="Delete"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function formatTime(s) {
  if (!s) return '';
  // SQLite returns UTC without 'Z'; make it explicit so browser converts to local.
  const d = new Date(s.replace(' ', 'T') + 'Z');
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
