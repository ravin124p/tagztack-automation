import { useState, useRef, useEffect } from 'react';
import { LOGO_VARIANTS, getLogoById } from './LogoOptions.jsx';

const LOGO_KEY = 'tagztack-logo-v1';

export default function OpHeader({
  capture,
  captures,
  activeCaptureId,
  onSelectCapture,
  onDeleteCapture,
  onNewCaptureClick,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [logoId, setLogoId] = useState(() => {
    try { return localStorage.getItem(LOGO_KEY) || 'original'; } catch { return 'original'; }
  });
  const ref = useRef(null);
  const logoRef = useRef(null);

  const ActiveMark = getLogoById(logoId).render;

  useEffect(() => {
    function onDoc(e) {
      if (logoRef.current && !logoRef.current.contains(e.target)) setLogoPickerOpen(false);
    }
    if (logoPickerOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [logoPickerOpen]);

  const pickLogo = (id) => {
    setLogoId(id);
    try { localStorage.setItem(LOGO_KEY, id); } catch {}
    setLogoPickerOpen(false);
  };

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const fullUrl = capture?.url || '—';

  return (
    <div className="op-header">
      <div className="op-header-left">
        <div className="brand" ref={logoRef}>
          <button
            className="brand-mark-btn"
            onClick={() => setLogoPickerOpen((o) => !o)}
            title="Click to change logo"
            type="button"
          >
            <ActiveMark size={28} accent="#f5c518" fg="#ffffff" />
          </button>
          <div className="brand-text">
            <span className="brand-name">TagZtack Automation</span>
            <span className="brand-tagline">Tag inventory &amp; QA</span>
          </div>
          {logoPickerOpen && (
            <div className="logo-picker-popover">
              <div className="logo-picker-title">Choose a logo</div>
              <div className="logo-picker-grid">
                {LOGO_VARIANTS.map((v) => {
                  const Mark = v.render;
                  return (
                    <button
                      key={v.id}
                      className={'logo-picker-item' + (v.id === logoId ? ' active' : '')}
                      onClick={() => pickLogo(v.id)}
                      title={v.name}
                      type="button"
                    >
                      <div className="logo-picker-swatch">
                        <Mark size={48} accent="#f5c518" fg="#ffffff" />
                      </div>
                      <div className="logo-picker-name">{v.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="brand-divider" />

        <div className="op-data-sources" ref={ref}>
          <button
            className="op-data-sources-btn"
            onClick={() => setPickerOpen((o) => !o)}
            title="Switch capture"
          >
            <span className="op-data-sources-icon">▤</span>
            <span>Data Sources</span>
            <span className="op-chevron">▾</span>
          </button>
          {pickerOpen && (
            <div className="op-data-sources-menu">
              <div className="op-data-sources-menu-header">
                <span>Captures ({captures.length})</span>
                <button
                  className="op-data-sources-new"
                  onClick={() => {
                    setPickerOpen(false);
                    onNewCaptureClick();
                  }}
                >
                  + New
                </button>
              </div>
              {captures.length === 0 ? (
                <div className="op-data-sources-empty">No captures yet.</div>
              ) : (
                captures.map((c) => (
                  <div
                    key={c.id}
                    className={
                      'op-data-sources-item' +
                      (c.id === activeCaptureId ? ' active' : '')
                    }
                    onClick={() => {
                      onSelectCapture(c.id);
                      setPickerOpen(false);
                    }}
                  >
                    <div className="op-data-sources-item-url" title={c.url}>
                      {c.url}
                    </div>
                    <div className="op-data-sources-item-meta">
                      <span>{formatRelative(c.created_at)}</span>
                      <span>
                        {c.status === 'completed'
                          ? `${c.request_count} req`
                          : c.status === 'failed'
                          ? 'failed'
                          : c.status}
                      </span>
                    </div>
                    <button
                      className="op-data-sources-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this capture?')) onDeleteCapture(c.id);
                      }}
                      title="Delete"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <h1 className="op-header-domain" title={fullUrl}>
          {fullUrl}
        </h1>
      </div>
    </div>
  );
}

function formatRelative(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}
