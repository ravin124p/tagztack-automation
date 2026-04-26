function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function safeUrl(s) {
  try { return new URL(s); } catch { return null; }
}

function v(group, key, value) {
  if (value == null || value === '') return null;
  return { group, key, value: String(value) };
}

function flat(arr) {
  return arr.flat().filter(Boolean);
}

function paramsAsVars(u, group = 'Query') {
  return [...u.searchParams.entries()].map(([k, val]) => v(group, k, val));
}

function decodeMaybeJson(s) {
  if (!s) return s;
  try { return JSON.stringify(JSON.parse(s)); } catch { return s; }
}

const EXTRACTORS = {
  'adobe-analytics': adobeAnalyticsUnifiedExtract,
  'adobe-audience-manager': adobeAamExtract,
  'pinterest': pinterestExtract,
  'tradedesk': tradeDeskExtract,
  'ga4': ga4Extract,
  'ua': uaExtract,
  'gtm': gtmExtract,
  'gtag': gtmExtract,
  'facebook-pixel': facebookExtract,
  'google-ads': googleAdsExtract,
  'doubleclick': doubleclickExtract,
  'linkedin': linkedinExtract,
  'tiktok': tiktokExtract,
  'snap': snapExtract,
  'reddit': simpleQueryExtract,
  'bing-uet': bingUetExtract,
  'twitter': simpleQueryExtract,
  'marketo': marketoExtract,
  'tealium': tealiumExtract,
  'quantcast': simpleQueryExtract,
  'siteimprove': simpleQueryExtract,
  'qualtrics': qualtricsExtract,
  'criteo': simpleQueryExtract,
  'taboola': simpleQueryExtract,
  'outbrain': simpleQueryExtract,
  'amazon-ads': simpleQueryExtract,
  'liveramp': simpleQueryExtract,
  'demandbase': demandbaseExtract,
  'zoominfo': simpleQueryExtract,
  'hotjar': hotjarExtract,
  'fullstory': simpleQueryExtract,
  'quantum-metric': quantumMetricExtract,
  'clarity': simpleQueryExtract,
  'crazyegg': simpleQueryExtract,
  'optimizely': simpleQueryExtract,
  'vwo': simpleQueryExtract,
  'adobe-target': simpleQueryExtract,
  'onetrust': onetrustExtract,
  'hubspot': simpleQueryExtract,
  'invoca': invocaExtract,
  'glance': simpleQueryExtract,
  'rubicon': simpleQueryExtract,
  'appnexus': simpleQueryExtract,
  'tapad': simpleQueryExtract,
  'nextdoor': simpleQueryExtract,
};

export function extractVariables(tagId, request) {
  const u = safeUrl(request.url);
  if (!u) return [];
  const fn = EXTRACTORS[tagId];
  if (!fn) return simpleQueryExtract(u, request.request_body, request);
  try {
    return (fn(u, request.request_body, request) || []).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function simpleQueryExtract(u) {
  return paramsAsVars(u);
}

// ---- Adobe Experience Edge (the heart of the user's request) ----
function adobeEdgeExtract(u, body) {
  const out = [];
  const j = safeJson(body);
  if (!j) {
    out.push(...paramsAsVars(u, 'Query'));
    return out;
  }

  out.push(v('Edge', 'configId', u.searchParams.get('configId')));
  out.push(v('Edge', 'requestId', u.searchParams.get('requestId')));

  const events = Array.isArray(j.events) ? j.events : [];
  events.forEach((ev, idx) => {
    const prefix = events.length > 1 ? `event[${idx}].` : '';
    if (ev.xdm) {
      out.push(v('Event', `${prefix}eventType`, ev.xdm.eventType));
      out.push(v('Event', `${prefix}timestamp`, ev.xdm.timestamp));
      const wpd = ev.xdm.web?.webPageDetails || {};
      out.push(v('Page', `${prefix}URL`, wpd.URL));
      out.push(v('Page', `${prefix}name`, wpd.name));
      out.push(v('Page', `${prefix}siteSection`, wpd.siteSection));
      out.push(v('Page', `${prefix}referrer`, ev.xdm.web?.webReferrer?.URL));
      const pv = wpd.pageViews?.value;
      if (pv != null) out.push(v('Page', `${prefix}pageViews.value`, pv));
      const dev = ev.xdm.device || {};
      out.push(v('Device', `${prefix}screenWidth`, dev.screenWidth));
      out.push(v('Device', `${prefix}screenHeight`, dev.screenHeight));
      out.push(v('Device', `${prefix}orientation`, dev.screenOrientation));
      const env = ev.xdm.environment?.browserDetails || {};
      out.push(v('Device', `${prefix}viewportWidth`, env.viewportWidth));
      out.push(v('Device', `${prefix}viewportHeight`, env.viewportHeight));

      // Identity
      if (ev.xdm.identityMap) {
        for (const [ns, ids] of Object.entries(ev.xdm.identityMap)) {
          (ids || []).forEach((id, i) => {
            out.push(v('Identity', `${prefix}${ns}${ids.length > 1 ? `[${i}]` : ''}`, id.id));
          });
        }
      }

      if (ev.xdm._experience?.decisioning) {
        const d = ev.xdm._experience.decisioning;
        out.push(v('Decisioning', `${prefix}propositionEventType`, JSON.stringify(d.propositionEventType || {})));
        if (Array.isArray(d.propositions)) {
          d.propositions.forEach((p, i) => {
            out.push(v('Decisioning', `${prefix}propositions[${i}].scope`, p.scope));
            out.push(v('Decisioning', `${prefix}propositions[${i}].id`, p.id));
          });
        }
      }
    }

    const an = ev.data?.__adobe?.analytics;
    if (an) {
      const eVars = {};
      const props = {};
      const lists = {};
      const general = {};
      for (const [k, val] of Object.entries(an)) {
        if (/^eVar\d+$/.test(k)) eVars[k] = val;
        else if (/^prop\d+$/.test(k)) props[k] = val;
        else if (/^list\d+$/.test(k)) lists[k] = val;
        else general[k] = val;
      }
      sortedNumeric(eVars).forEach(([k, val]) => out.push(v('Adobe Analytics — eVars', k, val)));
      sortedNumeric(props).forEach(([k, val]) => out.push(v('Adobe Analytics — props', k, val)));
      sortedNumeric(lists).forEach(([k, val]) => out.push(v('Adobe Analytics — lists', k, val)));
      Object.entries(general).forEach(([k, val]) => out.push(v('Adobe Analytics', k, typeof val === 'object' ? JSON.stringify(val) : val)));
    }
  });

  if (j.query?.identity?.fetch) {
    out.push(v('Edge', 'identity.fetch', j.query.identity.fetch.join(', ')));
  }
  if (j.query?.personalization?.decisionScopes) {
    out.push(v('Edge', 'decisionScopes', j.query.personalization.decisionScopes.join(', ')));
  }
  if (j.meta?.state?.domain) out.push(v('Edge', 'meta.domain', j.meta.state.domain));

  return out;
}

function sortedNumeric(obj) {
  return Object.entries(obj).sort(([a], [b]) => {
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    return na - nb;
  });
}

function adobeAnalyticsUnifiedExtract(u, body, request) {
  const isEdge = /\/ee\/(v\d+\/(interact|identity|acquire)|or2\/v\d+\/(interact|identity))/.test(u.pathname);
  if (isEdge) return adobeEdgeExtract(u, body, request);
  return adobeAnalyticsClassicExtract(u, body);
}

function adobeAnalyticsClassicExtract(u, body) {
  const out = [...paramsAsVars(u, 'Query')];
  if (body) {
    body.split('&').forEach((kv) => {
      const [k, val] = kv.split('=');
      if (!k) return;
      out.push(v('Body', decodeURIComponent(k), val ? decodeURIComponent(val) : ''));
    });
  }
  return out;
}

function adobeAamExtract(u) {
  return paramsAsVars(u, 'Audience Manager');
}

// ---- Pinterest ----
function pinterestExtract(u) {
  const out = [];
  const event = u.searchParams.get('event');
  const tid = u.searchParams.get('tid');
  const ed = u.searchParams.get('ed');
  const ad = u.searchParams.get('ad');
  const pd = u.searchParams.get('pd');

  if (tid) out.push(v('Pinterest', 'tid (Tag ID)', tid));
  if (event) out.push(v('Pinterest', 'event', event));

  for (const param of ['ed', 'ad', 'pd', 'ov']) {
    const raw = u.searchParams.get(param);
    if (!raw) continue;
    const decoded = safeJson(raw);
    if (decoded && typeof decoded === 'object') {
      Object.entries(decoded).forEach(([k, val]) =>
        out.push(v(`Pinterest — ${param}`, k, typeof val === 'object' ? JSON.stringify(val) : val))
      );
    } else {
      out.push(v('Pinterest', param, raw));
    }
  }
  for (const [k, val] of u.searchParams.entries()) {
    if (!['event', 'tid', 'ed', 'ad', 'pd', 'ov'].includes(k)) {
      out.push(v('Pinterest', k, val));
    }
  }
  return out;
}

// ---- The Trade Desk ----
function tradeDeskExtract(u) {
  const out = [];
  out.push(v('The Trade Desk', 'endpoint', u.pathname));
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('The Trade Desk', k, val));
  }
  return out;
}

// ---- GA4 / GA4 Measurement Protocol ----
function ga4Extract(u, body) {
  const out = [];
  const epRe = /^ep\.(.+)$/;
  const upRe = /^up\.(.+)$/;
  const enRe = /^en$/;

  for (const [k, val] of u.searchParams.entries()) {
    if (epRe.test(k)) out.push(v('Event Params', k.replace(/^ep\./, ''), val));
    else if (upRe.test(k)) out.push(v('User Properties', k.replace(/^up\./, ''), val));
    else if (k === 'tid') out.push(v('GA4', 'Measurement ID', val));
    else if (k === 'cid') out.push(v('GA4', 'Client ID', val));
    else if (k === 'sid') out.push(v('GA4', 'Session ID', val));
    else if (k === 'en') out.push(v('GA4', 'Event Name', val));
    else if (k === 'dl') out.push(v('GA4', 'Document Location', val));
    else if (k === 'dt') out.push(v('GA4', 'Document Title', val));
    else if (k === 'dr') out.push(v('GA4', 'Referrer', val));
    else if (k === 'sr') out.push(v('GA4', 'Screen Resolution', val));
    else if (k === 'ul') out.push(v('GA4', 'Language', val));
    else if (k === 'uid') out.push(v('GA4', 'User ID', val));
    else out.push(v('GA4', k, val));
  }

  if (body && body.startsWith('{')) {
    const j = safeJson(body);
    if (j?.events) {
      j.events.forEach((ev, i) => {
        out.push(v('Body Events', `events[${i}].name`, ev.name));
        if (ev.params) Object.entries(ev.params).forEach(([k, val]) =>
          out.push(v('Body Events', `events[${i}].params.${k}`, val))
        );
      });
    }
  }
  return out;
}

function uaExtract(u) {
  const map = { tid: 'Tracking ID', cid: 'Client ID', t: 'Hit Type', dl: 'Document Location', dt: 'Page Title', ec: 'Event Category', ea: 'Event Action', el: 'Event Label', ev: 'Event Value' };
  const out = [];
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Universal Analytics', map[k] || k, val));
  }
  return out;
}

function gtmExtract(u) {
  return [
    v('GTM', 'Container ID', u.searchParams.get('id')),
    v('GTM', 'GTM Auth (gtm_auth)', u.searchParams.get('gtm_auth')),
    v('GTM', 'Preview (gtm_preview)', u.searchParams.get('gtm_preview')),
    v('GTM', 'Path', u.pathname),
  ];
}

// ---- Facebook Pixel ----
function facebookExtract(u, body) {
  const out = [];
  const map = {
    id: 'Pixel ID', ev: 'Event', dl: 'Document Location', rl: 'Referrer',
    if: 'In iFrame', ts: 'Timestamp', sw: 'Screen Width', sh: 'Screen Height', v: 'Version',
  };
  for (const [k, val] of u.searchParams.entries()) {
    if (k.startsWith('cd[')) out.push(v('Custom Data', k.replace(/^cd\[|\]$/g, ''), val));
    else if (k.startsWith('ud[')) out.push(v('User Data', k.replace(/^ud\[|\]$/g, ''), val));
    else out.push(v('Facebook Pixel', map[k] || k, val));
  }
  if (body) body.split('&').forEach((kv) => {
    const [k, val] = kv.split('=');
    if (k) out.push(v('Body', decodeURIComponent(k), val ? decodeURIComponent(val) : ''));
  });
  return out;
}

function googleAdsExtract(u) {
  const map = {
    random: 'Random', cv: 'Conversion Version', fst: 'First Time', num: 'Conversion Number',
    bg: 'Bg Color', guid: 'GUID', resp: 'Response', frm: 'Frame', url: 'URL', ref: 'Referrer',
    tiba: 'Page Title', async: 'Async', rfmt: 'Format', label: 'Conversion Label',
    value: 'Conversion Value', currency_code: 'Currency', oid: 'Order ID',
  };
  const out = [];
  out.push(v('Google Ads', 'endpoint', u.pathname));
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Google Ads', map[k] || k, val));
  }
  return out;
}

function doubleclickExtract(u) {
  const out = [];
  out.push(v('DoubleClick', 'endpoint', u.pathname));
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('DoubleClick', k, val));
  }
  return out;
}

function linkedinExtract(u) {
  const map = { pid: 'Partner ID', conversionId: 'Conversion ID', time: 'Time', url: 'URL', fmt: 'Format' };
  const out = [];
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('LinkedIn', map[k] || k, val));
  }
  return out;
}

function tiktokExtract(u, body) {
  const out = [...paramsAsVars(u, 'TikTok')];
  if (body) {
    const j = safeJson(body);
    if (j) Object.entries(j).forEach(([k, val]) =>
      out.push(v('TikTok Body', k, typeof val === 'object' ? JSON.stringify(val) : val))
    );
  }
  return out;
}

function snapExtract(u, body) {
  const out = [];
  if (body) {
    const j = safeJson(body);
    if (j) {
      if (j.ctx) Object.entries(j.ctx).forEach(([k, val]) => out.push(v('Snap — ctx', k, val)));
      if (j.data) Object.entries(j.data).forEach(([k, val]) =>
        out.push(v('Snap — data', k, typeof val === 'object' ? JSON.stringify(val) : val))
      );
      Object.entries(j).forEach(([k, val]) => {
        if (k !== 'ctx' && k !== 'data') {
          out.push(v('Snap', k, typeof val === 'object' ? JSON.stringify(val) : val));
        }
      });
    }
  }
  return [...out, ...paramsAsVars(u, 'Snap Query')];
}

function bingUetExtract(u) {
  const map = { ti: 'Tag ID', evt: 'Event Type', Ver: 'Version', mid: 'Machine ID', sid: 'Session ID', vid: 'Visitor ID', p: 'Page URL', tl: 'Page Title', r: 'Referrer' };
  const out = [];
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Bing UET', map[k] || k, val));
  }
  return out;
}

function marketoExtract(u) {
  const map = { _mchNc: 'Cache Buster', _mchId: 'Munchkin ID', _mchTk: 'Tracking Token', _mchHo: 'Host', _mchRu: 'Page URL', _mchPg: 'Page Title', _mchRe: 'Referrer' };
  const out = [];
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Marketo', map[k] || k, val));
  }
  return out;
}

function tealiumExtract(u, body) {
  const out = [];
  const m = u.pathname.match(/\/utag\/([^/]+)\/([^/]+)/);
  if (m) {
    out.push(v('Tealium', 'Account', m[1]));
    out.push(v('Tealium', 'Profile', m[2]));
  }
  if (body) {
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      const j = safeJson(trimmed);
      if (j) walkFlat(j, 'Tealium', out);
    } else if (trimmed.includes('Content-Disposition: form-data')) {
      const dataMatch = trimmed.match(/name="data"\s*\r?\n\r?\n([\s\S]+?)(?=\r?\n--|$)/);
      if (dataMatch) {
        const j = safeJson(dataMatch[1].trim());
        if (j) walkFlat(j, 'Tealium', out);
      }
    }
  }
  return out;
}

function walkFlat(obj, prefix, out, depth = 0) {
  if (depth > 4) return;
  if (obj == null || typeof obj !== 'object') return;
  for (const [k, val] of Object.entries(obj)) {
    if (val == null) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      walkFlat(val, prefix + ' — ' + k, out, depth + 1);
    } else {
      out.push(v(prefix, k, Array.isArray(val) ? JSON.stringify(val) : val));
    }
  }
}

function qualtricsExtract(u) {
  const map = { BrandID: 'Brand ID', SurveyID: 'Survey ID', ZoneID: 'Zone ID', Q_LOC: 'Page URL', Q_Impress: 'Impression' };
  const out = [];
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Qualtrics', map[k] || k, val));
  }
  return out;
}

function demandbaseExtract(u) {
  return paramsAsVars(u, 'Demandbase');
}

function hotjarExtract(u) {
  return paramsAsVars(u, 'Hotjar');
}

function quantumMetricExtract(u) {
  const out = [];
  const m = u.pathname.match(/\/horizon\/([^/?]+)/);
  if (m) out.push(v('Quantum Metric', 'Subscription', m[1]));
  for (const [k, val] of u.searchParams.entries()) {
    out.push(v('Quantum Metric', k, val));
  }
  return out;
}

function onetrustExtract(u) {
  const m = u.pathname.match(/consent\/([a-f0-9-]+)/);
  const out = [];
  if (m) out.push(v('OneTrust', 'Consent ID', m[1]));
  out.push(v('OneTrust', 'Path', u.pathname));
  return out;
}

function invocaExtract(u) {
  return paramsAsVars(u, 'Invoca');
}

export function aggregateVariables(extractedPerRequest) {
  const map = new Map();
  for (const list of extractedPerRequest) {
    for (const item of list) {
      if (!item) continue;
      const k = `${item.group}::${item.key}`;
      let agg = map.get(k);
      if (!agg) {
        agg = { group: item.group, key: item.key, values: [], firstValue: item.value };
        map.set(k, agg);
      }
      if (!agg.values.includes(item.value)) agg.values.push(item.value);
    }
  }
  return [...map.values()].map((a) => ({
    group: a.group,
    key: a.key,
    value: a.firstValue,
    distinctCount: a.values.length,
    allValues: a.values,
  }));
}

export function groupVariables(vars) {
  const groups = new Map();
  for (const item of vars) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  return [...groups.entries()].map(([group, items]) => ({ group, items }));
}
