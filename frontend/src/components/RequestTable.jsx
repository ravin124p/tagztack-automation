import React from 'react';

export default function RequestTable({ requests, selectedId, onSelect }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 40 }}>#</th>
          <th>Name</th>
          <th style={{ width: 90 }}>Method</th>
          <th style={{ width: 80 }}>Status</th>
          <th style={{ width: 100 }}>Type</th>
          <th style={{ width: 180 }}>Domain</th>
          <th style={{ width: 80, textAlign: 'right' }}>Size</th>
          <th style={{ width: 80, textAlign: 'right' }}>Time</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => (
          <tr
            key={r.id}
            className={
              (selectedId === r.id ? 'selected ' : '') + (r.failed ? 'failed' : '')
            }
            onClick={() => onSelect(r)}
          >
            <td style={{ color: 'var(--text-dim)' }}>{r.sequence}</td>
            <td title={r.url}>{shortName(r.url)}</td>
            <td>{r.method}</td>
            <td className={statusClass(r)}>{statusLabel(r)}</td>
            <td className={'type-' + r.resource_type}>{r.resource_type}</td>
            <td style={{ color: 'var(--text-dim)' }}>{domain(r.url)}</td>
            <td style={{ textAlign: 'right' }}>{formatBytes(r.response_size)}</td>
            <td style={{ textAlign: 'right' }}>
              {r.duration_ms != null ? `${r.duration_ms} ms` : '—'}
            </td>
          </tr>
        ))}
        {requests.length === 0 && (
          <tr>
            <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
              No requests match filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function shortName(url) {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last || u.pathname || u.hostname;
  } catch {
    return url;
  }
}

function domain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function statusClass(r) {
  if (r.failed) return 'status-failed';
  const s = r.status;
  if (!s) return '';
  if (s < 300) return 'status-2xx';
  if (s < 400) return 'status-3xx';
  if (s < 500) return 'status-4xx';
  return 'status-5xx';
}

function statusLabel(r) {
  if (r.failed) return 'FAIL';
  return r.status || '—';
}

function formatBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
