import React, { useMemo, useState } from 'react';
import { detectTags, groupByCategory } from '../tags/detector.js';
import { CATEGORY_COLORS } from '../tags/taxonomy.js';
import { groupVariables } from '../tags/variables.js';

export default function TagsView({ capture, urlInput, setUrlInput, isCapturing, onCaptureRequested }) {
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [displayMode, setDisplayMode] = useState('percent');
  const [expandedTags, setExpandedTags] = useState(() => new Set());
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null);

  const detection = useMemo(
    () => detectTags(capture?.requests || [], capture?.url),
    [capture]
  );

  const categories = useMemo(() => groupByCategory(detection.tags), [detection.tags]);
  const totalTagCount = categories.reduce((s, c) => s + c.count, 0) || 1;

  const groupedTags = useMemo(() => groupTagsByName(detection.tags), [detection.tags]);

  const filteredGroups = useMemo(() => {
    const s = search.trim().toLowerCase();
    return groupedTags.filter((g) => {
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (!s) return true;
      return (
        g.name.toLowerCase().includes(s) ||
        g.vendor.toLowerCase().includes(s) ||
        g.accounts.some((a) => (a.account || '').toLowerCase().includes(s))
      );
    });
  }, [groupedTags, search, categoryFilter]);

  const totalPages = 1;

  function toggleExpand(name) {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div className="op-tags-view">
      <CaptureBar
        url={urlInput}
        setUrl={setUrlInput}
        onCapture={onCaptureRequested}
        isCapturing={isCapturing}
        capture={capture}
      />
      {!capture ? (
        <div className="op-empty">
          <div className="op-empty-title">Enter a URL above and click Capture</div>
          <div className="op-empty-body">
            We'll load the page in headless Chromium, capture every network request, and show all detected
            third-party marketing tags here.
          </div>
        </div>
      ) : (
        <>
      <StatsBar totals={detection.totals} onStatClick={setSelectedStat} />
      <CategoryBar
        categories={categories}
        totalTagCount={totalTagCount}
        onClick={() => setSelectedStat('categories')}
      />

      <div className="op-tags-table-header">
        <div className="op-tags-table-title">Pages With &amp; Without Tags</div>
        <div className="op-display-toggle">
          <button
            className={'op-toggle-btn ' + (displayMode === 'percent' ? 'active' : '')}
            onClick={() => setDisplayMode('percent')}
          >
            %
          </button>
          <button
            className={'op-toggle-btn ' + (displayMode === 'count' ? 'active' : '')}
            onClick={() => setDisplayMode('count')}
          >
            #
          </button>
        </div>
      </div>

      <div className="op-tags-filter-bar">
        <div className="op-search-wrap">
          <span className="op-search-icon">⌕</span>
          <input
            type="text"
            className="op-search-input"
            placeholder="Search By URL"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="op-filter-dropdown">
          <button
            className="op-filter-btn"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <span className="op-filter-icon">⚙</span>
            Filters
            <span className="op-chevron">▾</span>
          </button>
          {filterOpen && (
            <div className="op-filter-menu">
              <div className="op-filter-menu-label">Category</div>
              <div
                className={'op-filter-menu-item' + (categoryFilter === 'all' ? ' active' : '')}
                onClick={() => {
                  setCategoryFilter('all');
                  setFilterOpen(false);
                }}
              >
                All categories
              </div>
              {[...new Set(detection.tags.map((t) => t.category))].sort().map((c) => (
                <div
                  key={c}
                  className={'op-filter-menu-item' + (categoryFilter === c ? ' active' : '')}
                  onClick={() => {
                    setCategoryFilter(c);
                    setFilterOpen(false);
                  }}
                >
                  <span
                    className="op-filter-menu-dot"
                    style={{ background: CATEGORY_COLORS[c] || CATEGORY_COLORS.Uncategorized }}
                  />
                  {c}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="op-tags-table-wrap">
        {filteredGroups.length === 0 ? (
          <div className="empty" style={{ padding: 60 }}>
            <div>
              <div className="empty-title">No third-party tags detected</div>
              <div>This capture didn't match any vendors in our catalog.</div>
            </div>
          </div>
        ) : (
          <table className="op-tags-table">
            <thead>
              <tr>
                <th style={{ width: '38%' }}>TAG NAME</th>
                <th>ACCOUNTS</th>
                <th>PAGES MISSING TAGS (BY ACCOUNT)</th>
                <th>PAGES WITH TAGS (BY ACCOUNT) ↓</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => (
                <React.Fragment key={g.name}>
                  <tr
                    className={'op-tag-row' + (expandedTags.has(g.name) ? ' expanded' : '')}
                    onClick={() => toggleExpand(g.name)}
                  >
                    <td>
                      <div className="op-tag-name-cell">
                        <span className="op-expand-chevron">
                          {expandedTags.has(g.name) ? '⌄' : '›'}
                        </span>
                        <TagIcon tag={g} />
                        <div className="op-tag-name-block">
                          <span className="op-tag-name">{g.name}</span>
                          {g.accounts[0]?.preview && (
                            <span className="op-tag-preview">
                              <span className="op-tag-preview-key">{g.accounts[0].preview.label}:</span>
                              <span className="op-tag-preview-value" title={g.accounts[0].preview.value}>
                                {String(g.accounts[0].preview.value).slice(0, 80)}
                                {String(g.accounts[0].preview.value).length > 80 ? '…' : ''}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="op-tag-accounts">{g.accounts.length}</td>
                    <td>
                      <CoverageBar
                        percent={percentMissing(g, totalPages)}
                        count={countMissing(g, totalPages)}
                        total={totalPages * g.accounts.length}
                        kind="missing"
                        mode={displayMode}
                      />
                    </td>
                    <td>
                      <CoverageBar
                        percent={percentWith(g, totalPages)}
                        count={countWith(g, totalPages)}
                        total={totalPages * g.accounts.length}
                        kind="with"
                        color={g.color}
                        mode={displayMode}
                      />
                    </td>
                  </tr>
                  {expandedTags.has(g.name) &&
                    g.accounts.map((a) => (
                      <tr
                        key={`${g.name}::${a.account || 'no-account'}`}
                        className={
                          'op-tag-account-row' +
                          (selectedAccount?.tagName === g.name &&
                          selectedAccount?.account === (a.account || null)
                            ? ' selected'
                            : '')
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAccount({
                            tagName: g.name,
                            account: a.account || null,
                            entry: a,
                            tagGroup: g,
                          });
                        }}
                      >
                        <td>
                          <div
                            className="op-tag-name-cell"
                            style={{ paddingLeft: 56, color: 'var(--text-dim)' }}
                          >
                            {a.account || '(no account ID)'}
                          </div>
                        </td>
                        <td className="op-tag-accounts">—</td>
                        <td>
                          <CoverageBar
                            percent={a.failedCount > 0 ? 100 : 0}
                            count={a.failedCount > 0 ? 1 : 0}
                            total={1}
                            kind="missing"
                            mode={displayMode}
                            small
                          />
                        </td>
                        <td>
                          <CoverageBar
                            percent={a.failedCount > 0 ? 0 : 100}
                            count={a.failedCount > 0 ? 0 : 1}
                            total={1}
                            kind="with"
                            color={g.color}
                            mode={displayMode}
                            small
                          />
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedAccount && (
        <AccountDetail
          tag={selectedAccount.tagGroup}
          account={selectedAccount.entry}
          requests={(capture?.requests || []).filter((r) =>
            selectedAccount.entry.requestIds.includes(r.id)
          )}
          onClose={() => setSelectedAccount(null)}
        />
      )}

      {selectedStat && (
        <StatDetailPanel
          stat={selectedStat}
          capture={capture}
          detection={detection}
          groupedTags={groupedTags}
          categories={categories}
          onClose={() => setSelectedStat(null)}
          onPickAccount={(entry, group) => {
            setSelectedAccount({ tagName: group.name, account: entry.account || null, entry, tagGroup: group });
            setSelectedStat(null);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}

function StatDetailPanel({ stat, capture, detection, groupedTags, categories, onClose, onPickAccount }) {
  const title = STAT_TITLES[stat] || stat;
  return (
    <div className="op-account-detail">
      <div className="op-account-detail-header">
        <div className="op-stat-detail-icon">{STAT_ICONS[stat] || '◧'}</div>
        <div className="op-account-detail-title">
          <div className="op-account-detail-name">{title}</div>
          <div className="op-account-detail-account">{capture?.url}</div>
        </div>
        <button className="op-account-detail-close" onClick={onClose}>×</button>
      </div>
      <div className="op-account-detail-body">
        {stat === 'pages-scanned' && <PagesScannedDetail capture={capture} detection={detection} />}
        {stat === 'unique-tags' && <UniqueTagsDetail groupedTags={groupedTags} onPickAccount={onPickAccount} />}
        {stat === 'broken-requests' && <BrokenRequestsDetail capture={capture} groupedTags={groupedTags} onPickAccount={onPickAccount} />}
        {stat === 'broken-pages' && <BrokenPagesDetail capture={capture} detection={detection} />}
        {stat === 'categories' && <CategoriesDetail categories={categories} groupedTags={groupedTags} onPickAccount={onPickAccount} />}
      </div>
    </div>
  );
}

const STAT_TITLES = {
  'pages-scanned': 'Pages Scanned',
  'unique-tags': 'Unique Tags',
  'broken-requests': 'Broken Tag Requests',
  'broken-pages': 'Broken Pages',
  'categories': 'Categories Breakdown',
};

const STAT_ICONS = {
  'pages-scanned': '◧',
  'unique-tags': '⊙',
  'broken-requests': '⚠',
  'broken-pages': '✕',
  'categories': '⌬',
};

function PagesScannedDetail({ capture, detection }) {
  if (!capture) return <div className="op-var-empty">No capture loaded.</div>;
  const totalBytes = (capture.requests || []).reduce((s, r) => s + (r.response_size || 0), 0);
  return (
    <>
      <dl className="kv">
        <dt>URL</dt><dd style={{ wordBreak: 'break-all' }}>{capture.url}</dd>
        <dt>Captured</dt><dd>{capture.created_at}</dd>
        <dt>Status</dt><dd>{capture.status}</dd>
        <dt>Total Requests</dt><dd>{(capture.requests || []).length}</dd>
        <dt>Third-Party</dt><dd>{detection.totals.thirdPartyRequests}</dd>
        <dt>Tag Requests</dt><dd>{detection.totals.totalTags}</dd>
        <dt>Total Bytes</dt><dd>{formatBytesLocal(totalBytes)}</dd>
        <dt>Load Time</dt><dd>{capture.total_duration_ms} ms</dd>
        {capture.error && (<><dt>Error</dt><dd style={{ color: 'var(--red)' }}>{capture.error}</dd></>)}
      </dl>
    </>
  );
}

function UniqueTagsDetail({ groupedTags, onPickAccount }) {
  if (!groupedTags.length) return <div className="op-var-empty">No tags detected.</div>;
  const byCategory = new Map();
  for (const g of groupedTags) {
    if (!byCategory.has(g.category)) byCategory.set(g.category, []);
    byCategory.get(g.category).push(g);
  }
  return (
    <div className="op-stat-detail-list">
      {[...byCategory.entries()].map(([cat, items]) => (
        <div key={cat} className="op-stat-detail-group">
          <div className="op-stat-detail-group-title">
            <CategoryPill category={cat} />
            <span className="op-stat-detail-group-count">{items.length} tag{items.length === 1 ? '' : 's'}</span>
          </div>
          {items.map((g) => (
            <div key={g.name} className="op-stat-detail-tag">
              <TagIcon tag={g} />
              <div className="op-stat-detail-tag-info">
                <div className="op-stat-detail-tag-name">{g.name}</div>
                <div className="op-stat-detail-tag-meta">
                  {g.vendor} · {g.accounts.length} account{g.accounts.length === 1 ? '' : 's'} · {g.totalRequests} request{g.totalRequests === 1 ? '' : 's'}
                </div>
              </div>
              <div className="op-stat-detail-tag-actions">
                {g.accounts.map((a) => (
                  <button
                    key={a.account || 'no-acct'}
                    className="op-stat-detail-acct-btn"
                    onClick={() => onPickAccount(a, g)}
                    title={a.account || '(no account ID)'}
                  >
                    {(a.account || '—').slice(0, 22)}{(a.account || '').length > 22 ? '…' : ''}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BrokenRequestsDetail({ capture, groupedTags, onPickAccount }) {
  const reqIdToTag = new Map();
  for (const g of groupedTags) {
    for (const a of g.accounts) {
      for (const id of a.requestIds || []) reqIdToTag.set(id, { group: g, account: a });
    }
  }
  const failed = (capture?.requests || []).filter((r) => r.failed);
  if (failed.length === 0) {
    return <div className="op-stat-detail-allgood">✓ No broken requests in this capture.</div>;
  }
  return (
    <div className="op-stat-detail-list">
      <div className="op-stat-detail-summary">
        <strong>{failed.length}</strong> failed request{failed.length === 1 ? '' : 's'} out of {(capture?.requests || []).length}
      </div>
      {failed.map((r) => {
        const match = reqIdToTag.get(r.id);
        return (
          <div key={r.id} className="op-stat-detail-broken">
            <div className="op-stat-detail-broken-head">
              <span className="op-stat-detail-broken-method">{r.method}</span>
              <span className="op-stat-detail-broken-fail">FAIL</span>
              {match && (
                <button
                  className="op-stat-detail-broken-tag"
                  onClick={() => onPickAccount(match.account, match.group)}
                >
                  {match.group.name}{match.account.account ? ` · ${match.account.account.slice(0, 20)}` : ''}
                </button>
              )}
            </div>
            <div className="op-stat-detail-broken-url">{r.url}</div>
            {r.failure_text && (
              <div className="op-stat-detail-broken-error">{r.failure_text}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BrokenPagesDetail({ capture, detection }) {
  const broken = capture?.status !== 'completed' || detection.totals.brokenTags > 0 || (capture?.requests || []).some((r) => r.failed);
  return (
    <>
      <div className={'op-stat-detail-overall ' + (broken ? 'fail' : 'ok')}>
        {broken ? '✕ This page has issues' : '✓ Page captured cleanly'}
      </div>
      <dl className="kv">
        <dt>URL</dt><dd style={{ wordBreak: 'break-all' }}>{capture?.url}</dd>
        <dt>Capture Status</dt><dd>{capture?.status}</dd>
        <dt>Failed Requests</dt><dd>{(capture?.requests || []).filter((r) => r.failed).length}</dd>
        <dt>Tags w/ Failures</dt><dd>{detection.totals.brokenTags}</dd>
        {capture?.error && (<><dt>Capture Error</dt><dd style={{ color: 'var(--red)' }}>{capture.error}</dd></>)}
      </dl>
    </>
  );
}

function CategoriesDetail({ categories, groupedTags, onPickAccount }) {
  if (categories.length === 0) return <div className="op-var-empty">No categories detected.</div>;
  const sorted = [...categories].sort((a, b) => b.count - a.count);
  return (
    <div className="op-stat-detail-list">
      {sorted.map((c) => {
        const tagsInCat = groupedTags.filter((g) => g.category === c.category);
        return (
          <div key={c.category} className="op-stat-detail-group">
            <div className="op-stat-detail-group-title">
              <CategoryPill category={c.category} />
              <span className="op-stat-detail-group-count">{c.uniqueCount} tags · {c.count} requests</span>
            </div>
            {tagsInCat.map((g) => (
              <div key={g.name} className="op-stat-detail-tag">
                <TagIcon tag={g} />
                <div className="op-stat-detail-tag-info">
                  <div className="op-stat-detail-tag-name">{g.name}</div>
                  <div className="op-stat-detail-tag-meta">{g.vendor} · {g.totalRequests} req</div>
                </div>
                {g.accounts[0] && (
                  <button
                    className="op-stat-detail-acct-btn"
                    onClick={() => onPickAccount(g.accounts[0], g)}
                  >
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function formatBytesLocal(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function CategoryPill({ category }) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.Uncategorized;
  return (
    <span
      className="category-pill"
      style={{ background: color + '22', color, borderColor: color + '55' }}
    >
      {category}
    </span>
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

function groupTagsByName(tags) {
  const map = new Map();
  for (const t of tags) {
    if (!map.has(t.name)) {
      map.set(t.name, {
        name: t.name,
        vendor: t.vendor,
        category: t.category,
        color: t.color,
        icon: t.icon,
        accounts: [],
        totalRequests: 0,
        totalFailed: 0,
      });
    }
    const g = map.get(t.name);
    g.accounts.push(t);
    g.totalRequests += t.requestCount;
    g.totalFailed += t.failedCount;
  }
  return [...map.values()].sort((a, b) => b.totalRequests - a.totalRequests);
}

function percentMissing(group, totalPages) {
  const totalSlots = totalPages * group.accounts.length;
  if (!totalSlots) return 0;
  const missing = group.accounts.reduce((s, a) => s + (a.failedCount > 0 ? 1 : 0), 0);
  return Math.round((missing / totalSlots) * 100);
}
function countMissing(group, totalPages) {
  return group.accounts.reduce((s, a) => s + (a.failedCount > 0 ? 1 : 0), 0);
}
function percentWith(group, totalPages) {
  return 100 - percentMissing(group, totalPages);
}
function countWith(group, totalPages) {
  const totalSlots = totalPages * group.accounts.length;
  return totalSlots - countMissing(group, totalPages);
}

function StatsBar({ totals, onStatClick }) {
  return (
    <div className="op-stats-bar">
      <StatCard
        label="Pages Scanned"
        value={1}
        onClick={() => onStatClick('pages-scanned')}
      />
      <StatCard
        label="Unique Tags"
        value={totals.uniqueTags}
        sparkline
        sparklineColor="#F5C518"
        subLabel="Click to view"
        subLabelDetail="all detected tags"
        onClick={() => onStatClick('unique-tags')}
      />
      <StatCard
        label="Broken Tag Requests"
        value={`${totals.brokenTags} of ${totals.totalTags}`}
        sparkline
        sparklineColor={totals.brokenTags > 0 ? '#EF4444' : '#F5C518'}
        subLabel="Click to view"
        subLabelDetail="failures"
        onClick={() => onStatClick('broken-requests')}
        danger={totals.brokenTags > 0}
      />
      <StatCard
        label="Broken Pages"
        value={totals.brokenTags > 0 ? 1 : 0}
        sparkline
        sparklineColor={totals.brokenTags > 0 ? '#EF4444' : '#F5C518'}
        subLabel="Click to view"
        subLabelDetail="page status"
        onClick={() => onStatClick('broken-pages')}
        danger={totals.brokenTags > 0}
      />
    </div>
  );
}

function StatCard({ label, value, sparkline, sparklineColor, subLabel, subLabelDetail, onClick, danger }) {
  return (
    <button
      className={'op-stat-card op-stat-card-clickable' + (danger ? ' danger' : '')}
      onClick={onClick}
      type="button"
    >
      <div className="op-stat-label">{label}</div>
      <div className="op-stat-value">{value}</div>
      {sparkline && (
        <>
          <div className="op-sparkline">
            {[0.45, 0.6, 0.5, 0.7, 0.55, 0.65].map((h, i) => (
              <div
                key={i}
                className="op-sparkline-bar"
                style={{ height: `${h * 100}%`, background: sparklineColor }}
              />
            ))}
          </div>
          {subLabel && (
            <div className="op-stat-sub">
              <span className="op-stat-sub-link">{subLabel} →</span>
              {subLabelDetail && (
                <span className="op-stat-sub-detail"> {subLabelDetail}</span>
              )}
            </div>
          )}
        </>
      )}
    </button>
  );
}

function CategoryBar({ categories, totalTagCount, onClick }) {
  if (categories.length === 0) {
    return (
      <div className="op-category-wrap">
        <div className="op-category-title">0 Unique Categories</div>
      </div>
    );
  }
  const sorted = [...categories].sort((a, b) => b.count - a.count);
  return (
    <div className="op-category-wrap op-category-wrap-clickable" onClick={onClick}>
      <div className="op-category-title">
        {categories.length} Unique Categories
        <span className="op-category-cta"> · Click to view breakdown →</span>
      </div>
      <div className="op-category-bar">
        {sorted.map((c) => (
          <div
            key={c.category}
            className="op-category-segment"
            style={{
              width: `${(c.count / totalTagCount) * 100}%`,
              background: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.Uncategorized,
            }}
            title={`${c.category}: ${c.uniqueCount} tags`}
          />
        ))}
      </div>
      <div className="op-category-legend">
        {sorted.map((c) => {
          const pct = Math.round((c.count / totalTagCount) * 100);
          return (
            <div key={c.category} className="op-category-legend-item">
              <span
                className="op-category-dot"
                style={{
                  background: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.Uncategorized,
                }}
              />
              <span>
                {c.category} <span className="op-category-pct">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoverageBar({ percent, count, total, kind, color, mode, small }) {
  const display =
    mode === 'count' ? `${count} / ${total}` : `${percent}%`;
  const barColor =
    kind === 'with'
      ? color || '#3B82F6'
      : percent > 0
      ? '#EF4444'
      : 'transparent';
  return (
    <div className={'op-coverage-bar' + (small ? ' small' : '')}>
      <div className="op-coverage-bar-track">
        <div
          className="op-coverage-bar-fill"
          style={{
            width: `${percent}%`,
            background: barColor,
          }}
        >
          <span className="op-coverage-bar-label">{display}</span>
        </div>
        {percent < 100 && (
          <span className="op-coverage-bar-label outside">{display}</span>
        )}
      </div>
    </div>
  );
}

function TagIcon({ tag }) {
  return (
    <div className="op-tag-icon" style={{ background: tag.color }}>
      <span style={{ color: contrastingText(tag.color) }}>{tag.icon}</span>
    </div>
  );
}

function contrastingText(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? '#000' : '#fff';
}

function AccountDetail({ tag, account, requests, onClose }) {
  const [tab, setTab] = useState('variables');
  const [varSearch, setVarSearch] = useState('');

  const groupedVars = useMemo(() => {
    const filtered = !varSearch
      ? account.variables || []
      : (account.variables || []).filter((v) => {
          const s = varSearch.toLowerCase();
          return (
            v.key.toLowerCase().includes(s) ||
            v.group.toLowerCase().includes(s) ||
            String(v.value).toLowerCase().includes(s)
          );
        });
    return groupVariables(filtered);
  }, [account.variables, varSearch]);

  return (
    <div className="op-account-detail">
      <div className="op-account-detail-header">
        <TagIcon tag={tag} />
        <div className="op-account-detail-title">
          <div className="op-account-detail-name">{tag.name}</div>
          <div className="op-account-detail-account">{account.account || '(no account ID)'}</div>
        </div>
        <button className="op-account-detail-close" onClick={onClose}>×</button>
      </div>

      <div className="op-account-detail-tabs">
        <button
          className={'op-account-tab' + (tab === 'variables' ? ' active' : '')}
          onClick={() => setTab('variables')}
        >
          Variables
          <span className="op-account-tab-count">
            {(account.variables || []).length}
          </span>
        </button>
        <button
          className={'op-account-tab' + (tab === 'requests' ? ' active' : '')}
          onClick={() => setTab('requests')}
        >
          Requests
          <span className="op-account-tab-count">{requests.length}</span>
        </button>
        <button
          className={'op-account-tab' + (tab === 'overview' ? ' active' : '')}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>
      </div>

      <div className="op-account-detail-body">
        {tab === 'overview' && (
          <dl className="kv">
            <dt>Vendor</dt>
            <dd>{tag.vendor}</dd>
            <dt>Category</dt>
            <dd>{tag.category}</dd>
            <dt>Account / ID</dt>
            <dd>{account.account || '—'}</dd>
            <dt>Requests</dt>
            <dd>{account.requestCount}</dd>
            <dt>Failed</dt>
            <dd style={{ color: account.failedCount > 0 ? 'var(--red)' : 'inherit' }}>
              {account.failedCount}
            </dd>
            <dt>Variables</dt>
            <dd>{(account.variables || []).length}</dd>
            <dt>Total Bytes</dt>
            <dd>{formatBytes(account.totalBytes)}</dd>
          </dl>
        )}

        {tab === 'variables' && (
          <>
            <input
              type="text"
              className="op-var-search"
              placeholder="Filter variables…"
              value={varSearch}
              onChange={(e) => setVarSearch(e.target.value)}
            />
            {groupedVars.length === 0 ? (
              <div className="op-var-empty">
                No variables extracted from this tag's payload.
              </div>
            ) : (
              <div className="op-var-groups">
                {groupedVars.map((g) => (
                  <VariableGroup key={g.group} group={g.group} items={g.items} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'requests' && (
          <div className="op-account-request-list">
            {requests.map((r) => (
              <div key={r.id} className="op-account-request-item">
                <div className="op-account-request-method">
                  <span className={'method-' + r.method.toLowerCase()}>{r.method}</span>
                  <span className={'status-' + statusClass(r.status)}>
                    {r.failed ? 'FAIL' : r.status}
                  </span>
                </div>
                <div className="op-account-request-url">{r.url}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VariableGroup({ group, items }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="op-var-group">
      <button className="op-var-group-header" onClick={() => setOpen(!open)}>
        <span className="op-var-group-chevron">{open ? '⌄' : '›'}</span>
        <span className="op-var-group-name">{group}</span>
        <span className="op-var-group-count">{items.length}</span>
      </button>
      {open && (
        <div className="op-var-group-body">
          {items.map((item, i) => (
            <VariableRow key={`${item.key}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariableRow({ item }) {
  const [copied, setCopied] = useState(false);
  const isLong = String(item.value).length > 100;
  const [expanded, setExpanded] = useState(false);

  const onCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(String(item.value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="op-var-row">
      <div className="op-var-key" title={item.key}>
        {item.key}
        {item.distinctCount > 1 && (
          <span className="op-var-distinct" title={`${item.distinctCount} distinct values across requests`}>
            ×{item.distinctCount}
          </span>
        )}
      </div>
      <div
        className={'op-var-value' + (isLong && !expanded ? ' truncated' : '')}
        onClick={() => isLong && setExpanded(!expanded)}
      >
        {item.value}
        {isLong && (
          <span className="op-var-expand">
            {expanded ? ' [collapse]' : ' [expand]'}
          </span>
        )}
      </div>
      <button className="op-var-copy" onClick={onCopy} title="Copy value">
        {copied ? '✓' : '⎘'}
      </button>
    </div>
  );
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function statusClass(status) {
  if (!status) return 'failed';
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}
