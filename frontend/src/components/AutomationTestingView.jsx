import React, { useState, useMemo, useRef } from 'react';
import { parseTestDoc, runTests, SAMPLE_JSON, SAMPLE_CSV, autoNameOne } from '../automation/runner.js';
import { detectTags } from '../tags/detector.js';
import { VENDORS } from '../tags/taxonomy.js';

const ASSERT_OPTIONS = [
  { value: 'fires', label: 'tag fires (no variable needed)' },
  { value: 'not-fires', label: 'tag does NOT fire' },
  { value: 'equals', label: 'variable equals' },
  { value: 'not-equals', label: 'variable does NOT equal' },
  { value: 'contains', label: 'variable contains' },
  { value: 'not-contains', label: 'variable does NOT contain' },
  { value: 'regex', label: 'variable matches regex' },
  { value: 'exists', label: 'variable exists (any value)' },
  { value: 'not-exists', label: 'variable does NOT exist' },
];

const VAR_NEEDED = new Set(['equals', 'not-equals', 'contains', 'not-contains', 'regex', 'exists', 'not-exists']);

export default function AutomationTestingView({ capture, onCaptureRequested, isCapturing, urlInput, setUrlInput }) {
  const [uploadedDoc, setUploadedDoc] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [filename, setFilename] = useState('');
  const [inlineTests, setInlineTests] = useState([]);
  const [results, setResults] = useState(null);
  const [filter, setFilter] = useState('all');
  const [suiteCollapsed, setSuiteCollapsed] = useState(false);
  const [resultsCollapsed, setResultsCollapsed] = useState(false);
  const fileRef = useRef(null);
  const resultsRef = useRef(null);

  const detection = useMemo(
    () => (capture ? detectTags(capture.requests || [], capture.url) : { tags: [] }),
    [capture]
  );

  const tagOptionsByName = useMemo(() => {
    const map = new Map();
    for (const t of detection.tags) {
      if (!map.has(t.name)) {
        map.set(t.name, {
          name: t.name,
          vendor: t.vendor,
          color: t.color,
          icon: t.icon,
          variables: new Set(),
        });
      }
      const entry = map.get(t.name);
      for (const v of t.variables || []) entry.variables.add(v.key);
    }
    const detectedTagNames = [...map.values()].map((e) => ({
      name: e.name, vendor: e.vendor, color: e.color, icon: e.icon,
      variables: [...e.variables].sort(),
      detected: true,
    }));
    const taxonomyOnly = VENDORS
      .filter((v) => !map.has(v.name))
      .map((v) => ({
        name: v.name, vendor: v.vendor, color: v.color, icon: v.icon,
        variables: [],
        detected: false,
      }));
    return [...detectedTagNames.sort((a, b) => a.name.localeCompare(b.name)),
            ...taxonomyOnly.sort((a, b) => a.name.localeCompare(b.name))];
  }, [detection.tags]);

  const onFile = async (file) => {
    setParseError(null);
    setResults(null);
    if (!file) return;
    setFilename(file.name);
    const text = await file.text();
    try {
      const doc = parseTestDoc(text, file.name);
      setUploadedDoc(doc);
    } catch (err) {
      setUploadedDoc(null);
      setParseError(err.message || String(err));
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const allTests = useMemo(() => {
    const uploaded = (uploadedDoc?.tests || []).map((t, i) => ({
      ...t,
      _source: 'uploaded',
      _id: `up-${t.id || i}`,
    }));
    const inline = inlineTests.map((t, i) => ({
      ...t,
      _source: 'inline',
      _id: t._id || `in-${i}`,
    }));
    return [...uploaded, ...inline];
  }, [uploadedDoc, inlineTests]);

  const onRun = () => {
    if (!capture || allTests.length === 0) return;
    const merged = {
      name: 'Combined Suite',
      tests: allTests.map(({ _source, _id, ...rest }) => rest),
    };
    const r = runTests(merged, capture);
    r.results = r.results.map((res, i) => ({ ...res, _source: allTests[i]?._source || 'unknown' }));
    setResults(r);
    setResultsCollapsed(false);
    setSuiteCollapsed(true);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };

  const addInlineTest = (t) => {
    setInlineTests((prev) => [...prev, { ...t, _id: 'in-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }]);
  };

  const deleteInlineTest = (id) => {
    setInlineTests((prev) => prev.filter((t) => t._id !== id));
  };

  const exportInlineTests = () => {
    const doc = {
      name: 'Inline Tests Export',
      url: capture?.url || null,
      tests: inlineTests.map(({ _id, ...rest }) => rest),
    };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tests-${Date.now()}.json`;
    a.click();
  };

  const downloadSample = (format) => {
    const content = format === 'json' ? SAMPLE_JSON : SAMPLE_CSV;
    const mime = format === 'json' ? 'application/json' : 'text/csv';
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sample-tests.${format}`;
    a.click();
  };

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (filter === 'all') return results.results;
    return results.results.filter((r) => r.status === filter);
  }, [results, filter]);

  return (
    <div className="op-automation-view">
      <CaptureBar
        url={urlInput}
        setUrl={setUrlInput}
        onCapture={onCaptureRequested}
        isCapturing={isCapturing}
        capture={capture}
      />

      <div className="op-automation-grid">
        <div className="op-automation-upload-card">
          <div className="op-automation-card-title">Upload Test Document</div>
          <div className="op-automation-card-body">
            <div
              className="op-automation-dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="op-automation-dropzone-icon">⤓</div>
              <div className="op-automation-dropzone-title">
                {filename ? <strong>{filename}</strong> : 'Drop a JSON or CSV file here'}
              </div>
              <div className="op-automation-dropzone-sub">
                {filename ? 'Click to replace' : 'or click to browse'}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.csv,application/json,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
            <div className="op-automation-sample-buttons">
              <button onClick={() => downloadSample('json')}>↓ Sample JSON</button>
              <button onClick={() => downloadSample('csv')}>↓ Sample CSV</button>
            </div>
            {parseError && (
              <div className="op-automation-error">Parse error: {parseError}</div>
            )}
            {uploadedDoc && !parseError && (
              <div className="op-automation-doc-summary">
                <strong>{uploadedDoc.name}</strong> — {uploadedDoc.tests.length} test{uploadedDoc.tests.length === 1 ? '' : 's'} parsed
              </div>
            )}
          </div>
        </div>

        <div className="op-automation-builder-card">
          <div className="op-automation-card-title">Build Tests Inline</div>
          <div className="op-automation-card-body">
            <InlineTestForm
              tagOptions={tagOptionsByName}
              onAdd={addInlineTest}
              detected={detection.tags.length > 0}
            />
          </div>
        </div>
      </div>

      {allTests.length > 0 && (
        <TestSuitePanel
          tests={allTests}
          onDelete={deleteInlineTest}
          onRun={onRun}
          captureReady={!!capture}
          inlineCount={inlineTests.length}
          uploadedCount={uploadedDoc?.tests.length || 0}
          onExportInline={inlineTests.length ? exportInlineTests : null}
          collapsed={suiteCollapsed}
          onToggleCollapse={() => setSuiteCollapsed((c) => !c)}
        />
      )}

      {results && (
        <div ref={resultsRef}>
          <ResultsPanel
            results={results}
            filter={filter}
            setFilter={setFilter}
            filtered={filteredResults}
            capture={capture}
            collapsed={resultsCollapsed}
            onToggleCollapse={() => setResultsCollapsed((c) => !c)}
            onClear={() => setResults(null)}
          />
        </div>
      )}
    </div>
  );
}

function CaptureBar({ url, setUrl, onCapture, isCapturing, capture }) {
  return (
    <div className="op-capture-bar">
      <div className="op-capture-bar-label">URL</div>
      <input
        type="text"
        className="op-capture-bar-input"
        placeholder="https://example.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !isCapturing && onCapture()}
        disabled={isCapturing}
      />
      <button
        className="op-capture-bar-btn"
        onClick={onCapture}
        disabled={isCapturing || !url}
      >
        {isCapturing ? <><span className="spinner" /> Capturing…</> : '▶ Capture'}
      </button>
      {capture && (
        <div className="op-capture-bar-meta">
          {capture.requests?.length || 0} requests
        </div>
      )}
    </div>
  );
}

function InlineTestForm({ tagOptions, onAdd, detected }) {
  const [testName, setTestName] = useState('');
  const [logic, setLogic] = useState('and');
  const [draftConditions, setDraftConditions] = useState([]);

  const [tag, setTag] = useState('');
  const [variable, setVariable] = useState('');
  const [assertion, setAssertion] = useState('fires');
  const [expected, setExpected] = useState('');
  const [varQuery, setVarQuery] = useState('');

  const selectedTag = tagOptions.find((t) => t.name === tag);
  const availableVars = selectedTag?.variables || [];
  const filteredVars = useMemo(() => {
    if (!varQuery) return availableVars;
    const q = varQuery.toLowerCase();
    return availableVars.filter((v) => v.toLowerCase().includes(q));
  }, [availableVars, varQuery]);

  const needsVar = VAR_NEEDED.has(assertion);
  const needsValue = assertion !== 'fires' && assertion !== 'not-fires' && assertion !== 'exists' && assertion !== 'not-exists';

  const canAddCondition =
    !!tag &&
    !!assertion &&
    (!needsVar || !!variable) &&
    (!needsValue || !!expected);

  const resetConditionFields = () => {
    setVariable('');
    setAssertion('fires');
    setExpected('');
    setVarQuery('');
  };

  const resetAll = () => {
    setTag('');
    resetConditionFields();
  };

  const addCondition = () => {
    if (!canAddCondition) return;
    setDraftConditions((prev) => [
      ...prev,
      {
        tag,
        variable: needsVar ? variable : null,
        assert: assertion,
        expected: needsValue ? expected : '',
      },
    ]);
    resetConditionFields();
  };

  const removeCondition = (idx) => {
    setDraftConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveTest = () => {
    const conditions = [...draftConditions];
    if (canAddCondition) {
      conditions.push({
        tag,
        variable: needsVar ? variable : null,
        assert: assertion,
        expected: needsValue ? expected : '',
      });
    }
    if (conditions.length === 0) return;

    const finalName =
      testName.trim() ||
      (conditions.length === 1
        ? autoNameOne({ tag: conditions[0].tag, variable: conditions[0].variable, assert: conditions[0].assert, expected: conditions[0].expected })
        : `${conditions[0].tag} (${conditions.length} conditions, ${logic.toUpperCase()})`);

    onAdd({
      name: finalName,
      logic,
      conditions,
    });
    setTestName('');
    setDraftConditions([]);
    setLogic('and');
    resetAll();
  };

  const cancelTest = () => {
    setTestName('');
    setDraftConditions([]);
    setLogic('and');
    resetAll();
  };

  const totalConditions = draftConditions.length + (canAddCondition ? 1 : 0);

  const sharedTagInfo = useMemo(() => {
    if (draftConditions.length === 0) return null;
    const tags = new Set(draftConditions.map((c) => c.tag));
    if (tags.size === 1) {
      const onlyTag = [...tags][0];
      return { tag: onlyTag, count: draftConditions.length };
    }
    return null;
  }, [draftConditions]);

  return (
    <div className="op-builder-form">
      <div className="op-builder-row">
        <label>Test Name <span className="op-builder-hint">(optional)</span></label>
        <input
          type="text"
          className="op-builder-input"
          placeholder="auto-generated if blank"
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
        />
      </div>

      <div className="op-builder-row">
        <label>Logic <span className="op-builder-hint">(when multiple conditions)</span></label>
        <div className="op-logic-toggle">
          <button
            className={'op-logic-option' + (logic === 'and' ? ' active' : '')}
            onClick={() => setLogic('and')}
            type="button"
          >
            ALL must pass <span className="op-logic-tag">AND</span>
          </button>
          <button
            className={'op-logic-option' + (logic === 'or' ? ' active' : '')}
            onClick={() => setLogic('or')}
            type="button"
          >
            ANY can pass <span className="op-logic-tag">OR</span>
          </button>
        </div>
      </div>

      {draftConditions.length > 0 && (
        <div className="op-draft-conditions">
          <div className="op-draft-conditions-label">
            Saved conditions ({draftConditions.length})
            <span className="op-logic-badge">{logic.toUpperCase()}</span>
          </div>
          {draftConditions.map((c, i) => (
            <div key={i} className="op-draft-condition">
              <span className="op-draft-condition-text">
                {autoNameOne({ tag: c.tag, variable: c.variable, assert: c.assert, expected: c.expected })}
              </span>
              <button
                className="op-draft-condition-delete"
                onClick={() => removeCondition(i)}
                title="Remove"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          {draftConditions.length > 0 && (
            <div className="op-draft-conditions-hint">
              Add more conditions below, or hit "Save Test" to finalize.
            </div>
          )}
        </div>
      )}

      <div className="op-builder-divider">
        <span>{draftConditions.length === 0 ? 'Condition' : `Condition #${draftConditions.length + 1}`}</span>
      </div>

      {sharedTagInfo && (
        <div className="op-tag-locked-banner">
          <span className="op-tag-locked-icon">🔒</span>
          <div className="op-tag-locked-text">
            <strong>Same tag locked.</strong> {sharedTagInfo.count} saved condition{sharedTagInfo.count === 1 ? '' : 's'} use{sharedTagInfo.count === 1 ? 's' : ''} <code>{sharedTagInfo.tag}</code>. Adding more variable checks will keep this tag.
          </div>
          <button
            className="op-tag-change-btn"
            onClick={() => { setTag(''); setVariable(''); setVarQuery(''); }}
            type="button"
          >
            Use a different tag
          </button>
        </div>
      )}

      <div className="op-builder-row">
        <label>
          Tag
          {tag && draftConditions.length > 0 && (
            <span className="op-builder-hint"> · stays for next condition</span>
          )}
        </label>
        <select
          className="op-builder-select"
          value={tag}
          onChange={(e) => { setTag(e.target.value); setVariable(''); setVarQuery(''); }}
        >
          <option value="">— select a tag —</option>
          {detected && (
            <optgroup label={`Detected in this capture (${tagOptions.filter((t) => t.detected).length})`}>
              {tagOptions.filter((t) => t.detected).map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}{t.variables.length ? ` (${t.variables.length} vars)` : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All known vendors">
            {tagOptions.filter((t) => !t.detected).map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="op-builder-row">
        <label>Assertion</label>
        <select
          className="op-builder-select"
          value={assertion}
          onChange={(e) => setAssertion(e.target.value)}
        >
          {ASSERT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {needsVar && (
        <div className="op-builder-row">
          <label>Variable</label>
          {availableVars.length > 0 ? (
            <>
              <input
                type="text"
                className="op-builder-input"
                placeholder={`Search ${availableVars.length} variables…`}
                value={varQuery}
                onChange={(e) => setVarQuery(e.target.value)}
              />
              <select
                className="op-builder-select"
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
                size={Math.min(8, Math.max(3, filteredVars.length))}
              >
                {filteredVars.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </>
          ) : (
            <input
              type="text"
              className="op-builder-input"
              placeholder={tag ? 'type variable name (no detected vars yet)' : 'pick a tag first'}
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              disabled={!tag}
            />
          )}
        </div>
      )}

      {needsValue && (
        <div className="op-builder-row">
          <label>Expected Value</label>
          <input
            type="text"
            className="op-builder-input"
            placeholder={
              assertion === 'regex' ? 'a regular expression, e.g. ^G-[A-Z0-9]+$' : 'value to compare against'
            }
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </div>
      )}

      <div className="op-builder-actions">
        <button
          className="op-builder-add-condition-btn"
          onClick={addCondition}
          disabled={!canAddCondition}
          type="button"
        >
          + Add Condition
        </button>
        <button
          className="op-builder-save-test-btn"
          onClick={saveTest}
          disabled={totalConditions === 0}
          type="button"
        >
          ✓ Save Test ({totalConditions})
        </button>
        {(draftConditions.length > 0 || tag) && (
          <button
            className="op-builder-cancel-btn"
            onClick={cancelTest}
            type="button"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function TestSuitePanel({ tests, onDelete, onRun, captureReady, inlineCount, uploadedCount, onExportInline, collapsed, onToggleCollapse }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleRow = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={'op-suite-panel' + (collapsed ? ' collapsed' : '')}>
      <div className="op-suite-panel-header">
        <button className="op-collapse-toggle" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          <span className="op-collapse-chevron">{collapsed ? '▸' : '▾'}</span>
          <div>
            <div className="op-suite-panel-title">Test Suite</div>
            <div className="op-suite-panel-subtitle">
              {tests.length} test{tests.length === 1 ? '' : 's'}
              {' '}({uploadedCount} from file, {inlineCount} built inline)
            </div>
          </div>
        </button>
        <div className="op-suite-panel-actions">
          {onExportInline && (
            <button className="op-suite-export-btn" onClick={onExportInline}>
              ↓ Export inline tests
            </button>
          )}
          <button
            className="op-suite-run-btn"
            onClick={onRun}
            disabled={!captureReady || tests.length === 0}
          >
            ▶ Run All Tests ({tests.length})
          </button>
        </div>
      </div>
      {collapsed ? null : (
      <table className="op-suite-table">
        <thead>
          <tr>
            <th style={{ width: 60 }}>Source</th>
            <th>Test name</th>
            <th style={{ width: 110 }}>Conditions</th>
            <th style={{ width: 80 }}>Logic</th>
            <th style={{ width: 30 }}></th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {tests.map((t) => {
            const conds = t.conditions || [];
            const isExpanded = expanded.has(t._id);
            const isMulti = conds.length > 1;
            return (
              <React.Fragment key={t._id}>
                <tr
                  className={'op-suite-row' + (isExpanded ? ' expanded' : '')}
                  onClick={() => toggleRow(t._id)}
                >
                  <td>
                    <span className={'op-suite-source ' + t._source}>
                      {t._source === 'uploaded' ? 'file' : 'inline'}
                    </span>
                  </td>
                  <td className="op-suite-test-name">{t.name}</td>
                  <td className="op-suite-tag">
                    {conds.length} condition{conds.length === 1 ? '' : 's'}
                  </td>
                  <td>
                    {isMulti ? (
                      <span className={'op-logic-badge ' + (t.logic || 'and')}>
                        {(t.logic || 'and').toUpperCase()}
                      </span>
                    ) : (
                      <span className="op-logic-badge single">—</span>
                    )}
                  </td>
                  <td>
                    <span className="op-row-expand-chevron">{isExpanded ? '▾' : '▸'}</span>
                  </td>
                  <td>
                    {t._source === 'inline' && (
                      <button
                        className="op-suite-delete-btn"
                        onClick={(e) => { e.stopPropagation(); onDelete(t._id); }}
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="op-suite-row-detail">
                    <td colSpan={6}>
                      <ConditionsTable conditions={conds} logic={t.logic} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
}

function ConditionsTable({ conditions, logic, results }) {
  return (
    <div className="op-conditions-table-wrap">
      {conditions.length > 1 && (
        <div className="op-conditions-logic">
          <span className={'op-logic-badge ' + (logic || 'and')}>{(logic || 'and').toUpperCase()}</span>
          <span className="op-conditions-logic-text">
            {logic === 'or'
              ? 'Any one of these conditions passing makes the test pass.'
              : 'All conditions must pass for the test to pass.'}
          </span>
        </div>
      )}
      <table className="op-conditions-table">
        <thead>
          <tr>
            {results && <th style={{ width: 36 }}></th>}
            <th>Tag</th>
            <th>Variable</th>
            <th>Assertion</th>
            <th>Expected</th>
            {results && <th>Actual</th>}
          </tr>
        </thead>
        <tbody>
          {conditions.map((c, i) => {
            const r = results?.[i];
            return (
              <tr key={i} className={r ? 'op-cond-row ' + r.status : ''}>
                {results && (
                  <td><StatusBadge status={r?.status || 'fail'} /></td>
                )}
                <td className="op-cond-tag">{c.tag}</td>
                <td className="op-cond-var">{c.variable || '—'}</td>
                <td className="op-cond-assert">{c.assert}</td>
                <td className="op-cond-expected" title={c.expected || ''}>
                  {c.expected || (c.assert === 'fires' || c.assert === 'not-fires' || c.assert === 'exists' || c.assert === 'not-exists' ? '—' : '')}
                </td>
                {results && (
                  <td className="op-cond-actual" title={r?.actual || ''}>
                    {r?.error ? <span className="op-automation-error-text">{r.error}</span> : (r?.actual || '—')}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultsPanel({ results, filter, setFilter, filtered, capture, collapsed, onToggleCollapse, onClear }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleRow = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const expandAll = () => setExpanded(new Set(filtered.map((r) => r.id)));
  const collapseAll = () => setExpanded(new Set());

  const allOk = results.failed === 0 && results.errors === 0;

  return (
    <div className={'op-automation-results' + (collapsed ? ' collapsed' : '')}>
      <div className="op-automation-results-header">
        <button className="op-collapse-toggle" onClick={onToggleCollapse} title={collapsed ? 'Expand' : 'Collapse'}>
          <span className="op-collapse-chevron">{collapsed ? '▸' : '▾'}</span>
          <div>
            <div className="op-automation-results-title">
              Results
              <span className={'op-results-overall ' + (allOk ? 'pass' : 'fail')}>
                {allOk ? '✓ All passed' : `✕ ${results.failed + results.errors} of ${results.total} failed`}
              </span>
            </div>
            <div className="op-results-subtitle">
              ran against {capture?.url ? new URL(capture.url).host : 'capture'} · {new Date(results.ranAt).toLocaleTimeString()}
            </div>
          </div>
        </button>
        <div className="op-automation-results-actions">
          <button className="op-results-tiny-btn" onClick={expandAll}>Expand all</button>
          <button className="op-results-tiny-btn" onClick={collapseAll}>Collapse all</button>
          <button className="op-results-tiny-btn" onClick={onClear}>Clear</button>
        </div>
      </div>

      {collapsed ? null : (
      <>
      <div className="op-automation-results-summary">
        <ResultPill label="Passed" value={results.passed} kind="pass" onClick={() => setFilter('pass')} active={filter === 'pass'} />
        <ResultPill label="Failed" value={results.failed} kind="fail" onClick={() => setFilter('fail')} active={filter === 'fail'} />
        {results.errors > 0 && (
          <ResultPill label="Errors" value={results.errors} kind="error" onClick={() => setFilter('error')} active={filter === 'error'} />
        )}
        <ResultPill label="All" value={results.total} kind="all" onClick={() => setFilter('all')} active={filter === 'all'} />
      </div>

      <div className="op-automation-progress">
        <div
          className="op-automation-progress-fill"
          style={{
            width: `${(results.passed / results.total) * 100}%`,
            background: allOk ? 'var(--green)' : 'var(--accent)',
          }}
        />
      </div>

      <table className="op-automation-table">
        <thead>
          <tr>
            <th style={{ width: 56 }}></th>
            <th>Test</th>
            <th style={{ width: 110 }}>Conditions</th>
            <th style={{ width: 80 }}>Logic</th>
            <th>First / failing condition</th>
            <th style={{ width: 30 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const isMulti = (r.conditions || []).length > 1;
            const lookConds = r.conditions || [];
            const summaryCond = lookConds.find((c) => c.status !== 'pass') || lookConds[0];
            return (
              <React.Fragment key={r.id}>
                <tr
                  className={'op-automation-row ' + r.status + (expanded.has(r.id) ? ' expanded' : '')}
                  onClick={() => toggleRow(r.id)}
                >
                  <td><StatusBadge status={r.status} /></td>
                  <td className="op-automation-test-name">{r.name}</td>
                  <td>
                    <span className="op-cond-count">
                      {r.passedCount}/{r.totalConditions}
                    </span>
                  </td>
                  <td>
                    {isMulti ? (
                      <span className={'op-logic-badge ' + (r.logic || 'and')}>
                        {(r.logic || 'and').toUpperCase()}
                      </span>
                    ) : (
                      <span className="op-logic-badge single">—</span>
                    )}
                  </td>
                  <td className="op-automation-summary-cond">
                    {summaryCond && (
                      <>
                        <span className="op-automation-tag-name">{summaryCond.tag}</span>
                        {summaryCond.variable && <span className="op-automation-var">· {summaryCond.variable}</span>}
                        <span className="op-cond-assert-inline"> {summaryCond.assert} </span>
                        <span className="op-cond-actual-inline">
                          {truncate(summaryCond.error || summaryCond.actual, 50)}
                        </span>
                      </>
                    )}
                  </td>
                  <td>
                    <span className="op-row-expand-chevron">
                      {expanded.has(r.id) ? '▾' : '▸'}
                    </span>
                  </td>
                </tr>
                {expanded.has(r.id) && (
                  <tr className="op-automation-row-detail">
                    <td colSpan={6}>
                      <ResultDetail result={r} capture={capture} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </>
      )}
    </div>
  );
}

function ResultDetail({ result }) {
  const conds = result.conditions || [];
  const isMulti = conds.length > 1;
  return (
    <div className="op-result-detail">
      <div className="op-result-detail-grid">
        <div className="op-result-detail-block">
          <div className="op-result-detail-label">Verdict</div>
          <div className={'op-result-detail-value ' + result.status}>
            {result.status === 'pass' ? '✓ PASS' : result.status === 'fail' ? '✕ FAIL' : '! ERROR'}
          </div>
        </div>
        <div className="op-result-detail-block">
          <div className="op-result-detail-label">Conditions Passed</div>
          <div className="op-result-detail-value">{result.passedCount} / {result.totalConditions}</div>
        </div>
        {isMulti && (
          <div className="op-result-detail-block">
            <div className="op-result-detail-label">Logic</div>
            <div className="op-result-detail-value">
              <span className={'op-logic-badge ' + (result.logic || 'and')}>
                {(result.logic || 'and').toUpperCase()}
              </span>
            </div>
          </div>
        )}
        <div className="op-result-detail-block">
          <div className="op-result-detail-label">Source</div>
          <div className="op-result-detail-value">{result._source === 'inline' ? 'built inline' : 'from file'}</div>
        </div>
      </div>

      <div className="op-result-detail-section">
        <div className="op-result-detail-label">
          {isMulti ? 'Per-Condition Results' : 'Condition Result'}
        </div>
        <ConditionsTable conditions={conds} logic={result.logic} results={conds} />
      </div>

      {conds.map((c, i) => {
        if (!c.actual && !c.error) return null;
        const longActual = c.actual && String(c.actual).length > 80;
        const longExpected = c.expected && String(c.expected).length > 80;
        if (!longActual && !longExpected && !c.error) return null;
        return (
          <div key={i} className="op-result-detail-section">
            <div className="op-result-detail-label">
              Condition #{i + 1}: {c.tag}{c.variable ? ` · ${c.variable}` : ''} · {c.assert}
            </div>
            {c.expected && (
              <pre className="op-result-detail-pre">expected: {c.expected}</pre>
            )}
            <pre className={'op-result-detail-pre ' + c.status}>
              {c.error ? `error: ${c.error}` : `actual: ${c.actual || '(no value found)'}`}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function truncate(s, n) {
  if (s == null) return '—';
  const str = String(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function ResultPill({ label, value, kind, onClick, active }) {
  return (
    <button
      className={'op-automation-pill ' + kind + (active ? ' active' : '')}
      onClick={onClick}
    >
      <span className="op-automation-pill-value">{value}</span>
      <span className="op-automation-pill-label">{label}</span>
    </button>
  );
}

function StatusBadge({ status }) {
  if (status === 'pass') return <span className="op-automation-badge pass">✓</span>;
  if (status === 'fail') return <span className="op-automation-badge fail">✕</span>;
  return <span className="op-automation-badge error">!</span>;
}
