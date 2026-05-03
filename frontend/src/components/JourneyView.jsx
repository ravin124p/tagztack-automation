import React, { useEffect, useMemo, useState } from 'react';
import { detectTags } from '../tags/detector.js';
import { CATEGORY_COLORS } from '../tags/taxonomy.js';
import { groupVariables } from '../tags/variables.js';

export default function JourneyView() {
  const [journeys, setJourneys] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeJourney, setActiveJourney] = useState(null);
  const [url, setUrl] = useState('');
  const [headless, setHeadless] = useState(false);
  const [maxSteps, setMaxSteps] = useState(50);
  const [stepThrough, setStepThrough] = useState(true);
  const [fieldDataText, setFieldDataText] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState('');
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('define');

  useEffect(() => { loadJourneys(); }, []);

  useEffect(() => {
    if (activeId == null) { setActiveJourney(null); return; }
    let cancelled = false;
    let timer = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/journeys/${activeId}`);
        const data = await res.json();
        if (cancelled) return;
        setActiveJourney(data);
        setMode('result');
        // Keep polling while the journey is still running so new steps
        // appear in the timeline as they capture.
        if (data.status === 'running') {
          timer = setTimeout(tick, 1500);
        }
      } catch { /* ignore transient fetch errors and retry */ if (!cancelled) timer = setTimeout(tick, 2500); }
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeId]);

  async function loadJourneys() {
    const res = await fetch('/api/journeys');
    setJourneys(await res.json());
  }

  async function runJourney() {
    setError(null);

    let body;
    if (advancedOpen && advancedJson.trim()) {
      try { body = JSON.parse(advancedJson); }
      catch (e) { setError('JSON parse error: ' + e.message); return; }
    } else {
      if (!url.trim()) { setError('Enter a URL to start the journey'); return; }
      body = { url: url.trim(), headless, maxSteps, stepThrough: !headless && stepThrough };
      if (fieldDataText.trim()) {
        try { body.fieldData = JSON.parse(fieldDataText); }
        catch (e) { setError('Field overrides JSON parse error: ' + e.message); return; }
      }
    }

    setIsRunning(true);
    try {
      const res = await fetch('/api/journeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Journey failed');
        setIsRunning(false);
        return;
      }
      // The journey is now running asynchronously on the backend. We get the
      // id immediately; setting activeId triggers the polling effect which
      // shows steps as they capture.
      await loadJourneys();
      setActiveId(data.id);
      setMode('result');
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
    }
  }

  // Stop the "Running…" spinner once the journey actually finishes.
  useEffect(() => {
    if (!isRunning) return;
    if (activeJourney && activeJourney.status && activeJourney.status !== 'running') {
      setIsRunning(false);
      loadJourneys(); // refresh the dropdown to reflect new status
    }
  }, [activeJourney, isRunning]);

  async function deleteJourney(id) {
    await fetch(`/api/journeys/${id}`, { method: 'DELETE' });
    if (activeId === id) setActiveId(null);
    loadJourneys();
  }

  return (
    <div className="op-journey-view">
      <div className="op-journey-toolbar">
        <div className="op-journey-tabs">
          <button
            className={'op-journey-tab' + (mode === 'define' ? ' active' : '')}
            onClick={() => setMode('define')}
          >
            Run
          </button>
          <button
            className={'op-journey-tab' + (mode === 'result' ? ' active' : '')}
            onClick={() => setMode('result')}
            disabled={!activeJourney}
          >
            Result {activeJourney ? `· ${activeJourney.name}` : ''}
          </button>
        </div>
        <div className="op-journey-toolbar-right">
          <select
            className="op-journey-picker"
            value={activeId || ''}
            onChange={(e) => setActiveId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— recent journeys —</option>
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                #{j.id} · {j.name} ({j.status})
              </option>
            ))}
          </select>
          {activeId && (
            <button
              className="op-journey-delete"
              onClick={() => { if (confirm('Delete this journey?')) deleteJourney(activeId); }}
              title="Delete this journey"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {mode === 'define' && (
        <DefineMode
          url={url}
          setUrl={setUrl}
          headless={headless}
          setHeadless={setHeadless}
          stepThrough={stepThrough}
          setStepThrough={setStepThrough}
          maxSteps={maxSteps}
          setMaxSteps={setMaxSteps}
          fieldDataText={fieldDataText}
          setFieldDataText={setFieldDataText}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          advancedJson={advancedJson}
          setAdvancedJson={setAdvancedJson}
          onRun={runJourney}
          isRunning={isRunning}
          error={error}
        />
      )}

      {mode === 'result' && activeJourney && (
        <ResultMode journey={activeJourney} />
      )}

      {mode === 'result' && !activeJourney && (
        <div className="op-empty" style={{ padding: 60 }}>
          <div>
            <div className="op-empty-title">No journey selected</div>
            <div>Run one, or pick from the dropdown above.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DefineMode({
  url, setUrl, headless, setHeadless, stepThrough, setStepThrough,
  maxSteps, setMaxSteps,
  fieldDataText, setFieldDataText,
  advancedOpen, setAdvancedOpen, advancedJson, setAdvancedJson,
  onRun, isRunning, error,
}) {
  return (
    <div className="op-journey-define">
      <div className="op-journey-simple">
        <div className="op-journey-simple-row">
          <label className="op-journey-field-label">Starting URL</label>
          <input
            type="text"
            className="op-journey-url-input"
            placeholder="https://example.com/apply"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isRunning && onRun()}
            disabled={isRunning}
          />
        </div>
        <div className="op-journey-simple-row op-journey-options">
          <label className="op-journey-checkbox" title="When on, you'll see Chrome open and an overlay appears in the browser at each step">
            <input
              type="checkbox"
              checked={!headless}
              onChange={(e) => setHeadless(!e.target.checked)}
            />
            Show browser while running
          </label>
          {!headless && (
            <label className="op-journey-checkbox" title="Pause on every page and ask whether to auto-fill or do it manually">
              <input
                type="checkbox"
                checked={stepThrough}
                onChange={(e) => setStepThrough(e.target.checked)}
              />
              Step through each page
              <span className="op-journey-checkbox-hint"> · ask Auto / Manual on each page</span>
            </label>
          )}
          <label className="op-journey-numfield">
            Max steps
            <input
              type="number"
              min={1}
              max={100}
              value={maxSteps}
              onChange={(e) => setMaxSteps(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
            />
          </label>
          <button
            className="op-journey-run-btn"
            onClick={onRun}
            disabled={isRunning || !url.trim()}
          >
            {isRunning ? <><span className="spinner" /> Running…</> : '▶ Run Journey'}
          </button>
        </div>

        <div className="op-journey-explainer">
          {!headless && stepThrough ? (
            <>
              We'll open the URL, capture the landing page, then on every page after that a yellow
              overlay asks <em>🤖 Auto-fill</em> · <em>✋ I'll do it manually</em> · <em>✕ Stop</em>.
              Pick Auto and we'll fill what we can with the defaults (or your overrides) and click the
              primary Continue/Next/Submit. Pick Manual and you drive the page yourself; click the
              overlay's Continue when you're done so we can capture the next state. Each page becomes
              a step in the journey timeline either way.
            </>
          ) : (
            <>
              We'll open the URL, fill forms with reasonable test data, click the primary{' '}
              <em>Continue / Next / Submit / Continue&nbsp;as&nbsp;Guest</em>-style button, and repeat
              until we reach a confirmation page or run out of steps. Each page is captured as a step.
            </>
          )}
        </div>

        <details className="op-journey-overrides">
          <summary>Test data overrides (optional) — bypass field validation by supplying values your UAT accepts</summary>
          <p className="op-journey-help-note">
            JSON map of field-name pattern → value. Each key is treated as a case-insensitive regex
            matched against the form field's <code>name</code>, <code>id</code>, label, placeholder, or
            <code>aria-label</code>. Overrides take precedence over our defaults. Common case: bank UATs
            blocklist the standard test SSN/EIN, so paste your team's approved test values here.
          </p>
          <textarea
            className="op-journey-textarea op-journey-overrides-textarea"
            value={fieldDataText}
            onChange={(e) => setFieldDataText(e.target.value)}
            spellCheck={false}
            rows={8}
            placeholder={'{\n  "ssn|social.?security": "555-12-3456",\n  "ein|tax.?id": "47-1234567",\n  "zip|postal": "55402",\n  "phone": "6125550199"\n}'}
          />
        </details>

        {error && <div className="op-journey-error">{error}</div>}
      </div>

      <details
        className="op-journey-advanced"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.target.open)}
      >
        <summary>Advanced — script the journey by hand (JSON)</summary>
        <p className="op-journey-help-note">
          Paste a journey definition with explicit <code>steps</code> for full control.
          When this box has content and is open, it takes precedence over the URL field above.
          Action types: <code>click</code>, <code>fill</code>, <code>select</code>,
          <code>check</code>, <code>press</code>, <code>wait</code>, <code>scroll</code>,
          <code>goto</code>.
        </p>
        <textarea
          className="op-journey-textarea"
          value={advancedJson}
          onChange={(e) => setAdvancedJson(e.target.value)}
          spellCheck={false}
          rows={20}
          placeholder={JSON.stringify({
            startUrl: 'https://example.com',
            headless: false,
            steps: [
              { name: 'Landing', capture: true },
              {
                name: 'Click first link',
                actions: [{ type: 'click', selector: 'a' }],
                waitMs: 2000,
                capture: true,
              },
            ],
          }, null, 2)}
        />
      </details>
    </div>
  );
}

function ResultMode({ journey }) {
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);
  const [tagFilter, setTagFilter] = useState(''); // per-step tag filter
  const step = journey.steps[selectedStepIdx];

  const detection = useMemo(() => {
    if (!step?.capture?.requests) return { tags: [], totals: {} };
    return detectTags(step.capture.requests, step.url_at_capture);
  }, [step]);

  // Reset the tag filter when the user navigates to a different step — the
  // previously-selected tag may not exist on the new step.
  useEffect(() => { setTagFilter(''); }, [selectedStepIdx]);

  return (
    <div className="op-journey-result">
      <div className="op-journey-summary">
        <div className="op-journey-summary-row">
          <span className="op-journey-summary-label">Journey</span>
          <span className="op-journey-summary-value">{journey.name}</span>
        </div>
        <div className="op-journey-summary-row">
          <span className="op-journey-summary-label">Start URL</span>
          <span className="op-journey-summary-value mono">{journey.start_url}</span>
        </div>
        <div className="op-journey-summary-row">
          <span className="op-journey-summary-label">Status</span>
          <span className={'op-journey-summary-value status-' + (journey.status || 'unknown')}>
            {journey.status}
            {journey.duration_ms ? ` · ${(journey.duration_ms / 1000).toFixed(1)}s total` : ''}
          </span>
        </div>
        {journey.error && (
          <div className="op-journey-summary-row">
            <span className="op-journey-summary-label">Error</span>
            <span className="op-journey-summary-value error">{journey.error}</span>
          </div>
        )}
      </div>

      <div className="op-journey-timeline">
        {journey.steps.map((s, i) => {
          const reqCount = s.capture?.requests?.length || 0;
          const isActive = i === selectedStepIdx;
          return (
            <button
              key={s.id}
              className={'op-journey-step' + (isActive ? ' active' : '') + ' status-' + (s.status || 'unknown')}
              onClick={() => setSelectedStepIdx(i)}
            >
              <div className="op-journey-step-num">{s.sequence}</div>
              <div className="op-journey-step-info">
                <div className="op-journey-step-name">{s.name}</div>
                <div className="op-journey-step-meta">
                  {s.status === 'completed' ? '✓' : '✕'}
                  {' '}{reqCount} req · {(s.duration_ms / 1000).toFixed(1)}s
                </div>
                {s.error && <div className="op-journey-step-error">{s.error}</div>}
                <div className="op-journey-step-url" title={s.url_at_capture}>{s.url_at_capture}</div>
              </div>
            </button>
          );
        })}
      </div>

      {step && step.capture && (
        <StepDetail
          step={step}
          detection={detection}
          tagFilter={tagFilter}
          setTagFilter={setTagFilter}
        />
      )}
    </div>
  );
}


function StepDetail({ step, detection, tagFilter, setTagFilter }) {
  const [selectedAccount, setSelectedAccount] = useState(null);

  const groupedTags = useMemo(() => {
    const map = new Map();
    for (const t of detection.tags) {
      if (!map.has(t.name)) {
        map.set(t.name, { ...t, accounts: [], totalRequests: 0, totalFailed: 0 });
      }
      const g = map.get(t.name);
      g.accounts.push(t);
      g.totalRequests += t.requestCount;
      g.totalFailed += t.failedCount;
    }
    return [...map.values()].sort((a, b) => b.totalRequests - a.totalRequests);
  }, [detection.tags]);

  // Apply the per-step tag filter from the dropdown
  const visibleTags = useMemo(() => {
    if (!tagFilter) return groupedTags;
    return groupedTags.filter((g) => g.name === tagFilter);
  }, [groupedTags, tagFilter]);

  const action = step.action_taken;
  const fills = action?.fills || [];

  return (
    <div className="op-journey-step-detail">
      <div className="op-journey-step-detail-header">
        <div className="op-journey-step-detail-title">
          Step {step.sequence}: {step.name}
        </div>
        <div className="op-journey-step-detail-stats">
          <span><strong>{detection.totals.uniqueTags || 0}</strong> tags</span>
          <span><strong>{detection.totals.totalRequests || 0}</strong> requests</span>
          <span><strong>{detection.totals.thirdPartyRequests || 0}</strong> 3rd party</span>
          <span className={detection.totals.brokenTags ? 'danger' : ''}>
            <strong>{detection.totals.brokenTags || 0}</strong> broken
          </span>
        </div>
      </div>

      {action && (
        <details className="op-journey-action-details" open={fills.length > 0 && fills.length <= 4}>
          <summary>
            <span>Action taken: clicked <code>{action.text}</code></span>
            {fills.length > 0 && <span className="op-journey-fill-count">· {fills.length} field{fills.length === 1 ? '' : 's'} filled</span>}
          </summary>
          {fills.length > 0 && (
            <table className="op-journey-fills-table">
              <thead>
                <tr><th>Field</th><th>Kind</th><th>Value used</th></tr>
              </thead>
              <tbody>
                {fills.map((f, i) => (
                  <tr key={i}>
                    <td className="op-journey-fill-name">{f.name || '(unnamed)'}</td>
                    <td className="op-journey-fill-kind">{f.kind}</td>
                    <td className="op-journey-fill-value" title={f.value}>
                      {f.kind === 'select' && f.text ? `${f.text} (${f.value})` : String(f.value).slice(0, 80)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      )}

      {/* Per-step tag dropdown — pick a tag fired on THIS page to focus on it. */}
      {groupedTags.length > 0 && (
        <div className="op-journey-tagfilter">
          <label className="op-journey-tagfilter-label">Show tag</label>
          <select
            className="op-journey-tagfilter-select"
            value={tagFilter || ''}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="">— All {groupedTags.length} tag{groupedTags.length === 1 ? '' : 's'} on this page —</option>
            {groupedTags.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name} · {g.totalRequests} req · {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'}
              </option>
            ))}
          </select>
          {tagFilter && (
            <button className="op-journey-tagfilter-clear" onClick={() => setTagFilter('')} title="Show all tags on this page">
              × Clear
            </button>
          )}
        </div>
      )}

      {visibleTags.length === 0 ? (
        <div className="op-empty" style={{ padding: 30 }}>
          <div>{tagFilter ? `"${tagFilter}" did not fire on this page.` : 'No third-party tags detected on this step.'}</div>
        </div>
      ) : (
        <div className="op-journey-tags">
          {visibleTags.map((g) => (
            <div key={g.name} className="op-journey-tag-block">
              <div className="op-journey-tag-head">
                <div className="op-tag-icon" style={{ background: g.color }}>
                  <span style={{ color: contrastingText(g.color) }}>{g.icon}</span>
                </div>
                <div>
                  <div className="op-tag-name">{g.name}</div>
                  <div className="op-journey-tag-meta">
                    <span style={{ color: CATEGORY_COLORS[g.category] }}>{g.category}</span>
                    {' · '}
                    {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'}
                    {' · '}
                    {g.totalRequests} req
                  </div>
                </div>
              </div>
              <div className="op-journey-tag-accounts">
                {g.accounts.map((a) => (
                  <button
                    key={a.account || 'no-acct'}
                    className="op-journey-tag-acct"
                    onClick={() => setSelectedAccount({ tag: g, account: a })}
                  >
                    <span className="op-journey-acct-id">{a.account || '(no account)'}</span>
                    <span className="op-journey-acct-vars">{a.variables.length} vars →</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedAccount && (
        <AccountVariablesPanel
          tag={selectedAccount.tag}
          account={selectedAccount.account}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
}

function AccountVariablesPanel({ tag, account, onClose }) {
  const [search, setSearch] = useState('');
  const grouped = useMemo(() => {
    const filtered = !search
      ? account.variables
      : account.variables.filter((v) => {
          const s = search.toLowerCase();
          return v.key.toLowerCase().includes(s) ||
                 v.group.toLowerCase().includes(s) ||
                 String(v.value).toLowerCase().includes(s);
        });
    return groupVariables(filtered);
  }, [account.variables, search]);

  return (
    <div className="op-account-detail">
      <div className="op-account-detail-header">
        <div className="op-tag-icon" style={{ background: tag.color }}>
          <span style={{ color: contrastingText(tag.color) }}>{tag.icon}</span>
        </div>
        <div className="op-account-detail-title">
          <div className="op-account-detail-name">{tag.name}</div>
          <div className="op-account-detail-account">{account.account || '(no account)'}</div>
        </div>
        <button className="op-account-detail-close" onClick={onClose}>×</button>
      </div>
      <div className="op-account-detail-body">
        <input
          type="text"
          className="op-var-search"
          placeholder={`Filter ${account.variables.length} variables…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="op-var-groups">
          {grouped.map((g) => (
            <div key={g.group} className="op-var-group">
              <div className="op-var-group-header">
                <span className="op-var-group-name">{g.group}</span>
                <span className="op-var-group-count">{g.items.length}</span>
              </div>
              <div className="op-var-group-body">
                {g.items.map((item, i) => (
                  <div key={i} className="op-var-row">
                    <div className="op-var-key">{item.key}</div>
                    <div className="op-var-value">{String(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function contrastingText(hex) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? '#000' : '#fff';
}
