import React, { useState } from 'react';

const TABS = ['headers', 'request', 'response'];

export default function RequestDetail({ request, onClose }) {
  const [tab, setTab] = useState('headers');
  const r = request;

  return (
    <div className="detail">
      <div className="detail-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={'detail-tab ' + (tab === t ? 'active' : '')}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button
          className="detail-tab"
          style={{ marginLeft: 'auto' }}
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
      </div>

      {tab === 'headers' && (
        <>
          <div className="detail-section">
            <h3>General</h3>
            <dl className="kv">
              <dt>URL</dt>
              <dd>{r.url}</dd>
              <dt>Method</dt>
              <dd>{r.method}</dd>
              <dt>Status</dt>
              <dd>
                {r.failed ? (
                  <span className="status-failed">
                    Failed — {r.failure_text}
                  </span>
                ) : (
                  `${r.status} ${r.status_text || ''}`
                )}
              </dd>
              <dt>Type</dt>
              <dd>{r.resource_type}</dd>
              <dt>Duration</dt>
              <dd>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</dd>
              <dt>Size</dt>
              <dd>{formatBytes(r.response_size)}</dd>
            </dl>
          </div>
          <div className="detail-section">
            <h3>Request Headers</h3>
            <HeaderList headers={r.request_headers} />
          </div>
          <div className="detail-section">
            <h3>Response Headers</h3>
            <HeaderList headers={r.response_headers} />
          </div>
        </>
      )}

      {tab === 'request' && (
        <div className="detail-section">
          <h3>Request Body</h3>
          <Body data={r.request_body} />
        </div>
      )}

      {tab === 'response' && (
        <div className="detail-section">
          <h3>Response</h3>
          <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            Response body capture is a later step — currently we store size &amp; headers only.
          </div>
        </div>
      )}
    </div>
  );
}

function HeaderList({ headers }) {
  const entries = Object.entries(headers || {});
  if (entries.length === 0) {
    return <div style={{ color: 'var(--text-dim)' }}>—</div>;
  }
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function Body({ data }) {
  if (!data) return <div style={{ color: 'var(--text-dim)' }}>No body</div>;
  let pretty = data;
  try {
    pretty = JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    // leave as-is
  }
  return (
    <pre style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      color: 'var(--text)',
    }}>{pretty}</pre>
  );
}

function formatBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
