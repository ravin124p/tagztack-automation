import { VENDORS } from './taxonomy.js';
import { extractVariables, aggregateVariables } from './variables.js';

const THIRD_PARTY_EXCLUDE_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

const PREVIEW_KEYS = [
  ['Adobe Analytics', 'pageName'],
  ['Adobe Analytics — eVars', 'eVar35'],
  ['Page', 'name'], ['Page', 'URL'],
  ['Pinterest', 'event'],
  ['GA4', 'Event Name'],
  ['Facebook Pixel', 'Event'],
  ['Bing UET', 'Event Type'],
  ['Snap — ctx', 'bt'],
  ['The Trade Desk', 'advertiser_id'],
  ['Marketo', 'Page URL'],
];

function safeUrl(str) {
  try {
    return new URL(str);
  } catch {
    return null;
  }
}

function baseDomain(host) {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

export function detectTags(requests, pageUrl) {
  const pageUrlObj = pageUrl ? safeUrl(pageUrl) : null;
  const pageBase = pageUrlObj ? baseDomain(pageUrlObj.host) : null;

  const hitsByKey = new Map();

  for (const req of requests || []) {
    const u = safeUrl(req.url);
    if (!u) continue;

    for (const v of VENDORS) {
      let matched = false;
      try {
        matched = !!v.match(u);
      } catch {
        matched = false;
      }
      if (!matched) continue;

      let account = null;
      try {
        account = v.account ? v.account(u) : null;
      } catch {
        account = null;
      }

      const key = `${v.id}|${account || ''}`;
      let hit = hitsByKey.get(key);
      if (!hit) {
        hit = {
          tagId: v.id,
          name: v.name,
          vendor: v.vendor,
          category: v.category,
          color: v.color,
          icon: v.icon,
          account,
          firstUrl: req.url,
          requestCount: 0,
          failedCount: 0,
          totalBytes: 0,
          requestIds: [],
          _extractedPerReq: [],
        };
        hitsByKey.set(key, hit);
      }
      hit.requestCount += 1;
      if (req.failed) hit.failedCount += 1;
      if (req.response_size) hit.totalBytes += req.response_size;
      if (req.id != null) hit.requestIds.push(req.id);

      const extracted = extractVariables(v.id, req);
      if (extracted && extracted.length) hit._extractedPerReq.push(extracted);
      break;
    }
  }

  const hits = [...hitsByKey.values()].map((h) => {
    const variables = aggregateVariables(h._extractedPerReq);
    delete h._extractedPerReq;
    return { ...h, variables, preview: pickPreview(variables) };
  });

  const thirdPartyRequests = (requests || []).filter((r) => {
    const u = safeUrl(r.url);
    if (!u) return false;
    if (!pageBase) return true;
    return baseDomain(u.host) !== pageBase;
  });

  return {
    tags: hits,
    totals: {
      totalRequests: (requests || []).length,
      thirdPartyRequests: thirdPartyRequests.length,
      totalTags: hits.reduce((s, h) => s + h.requestCount, 0),
      uniqueTags: hits.length,
      uniqueVendors: new Set(hits.map((h) => h.vendor)).size,
      uniqueCategories: new Set(hits.map((h) => h.category)).size,
      brokenTags: hits.filter((h) => h.failedCount > 0).length,
    },
  };
}

function pickPreview(variables) {
  for (const [group, key] of PREVIEW_KEYS) {
    const m = variables.find((x) => x.group === group && x.key === key);
    if (m) return { label: key, value: m.value };
  }
  const first = variables.find((x) => x.value && String(x.value).length < 80);
  return first ? { label: first.key, value: first.value } : null;
}

export function groupByCategory(tags) {
  const map = new Map();
  for (const t of tags) {
    if (!map.has(t.category)) map.set(t.category, []);
    map.get(t.category).push(t);
  }
  return [...map.entries()].map(([category, items]) => ({
    category,
    count: items.reduce((s, i) => s + i.requestCount, 0),
    uniqueCount: items.length,
  }));
}
