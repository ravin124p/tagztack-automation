import { detectTags } from '../tags/detector.js';

const ASSERTIONS = new Set([
  'fires', 'not-fires',
  'equals', 'not-equals',
  'contains', 'not-contains',
  'regex', 'exists', 'not-exists',
]);

const VAR_NEEDED = new Set(['equals', 'not-equals', 'contains', 'not-contains', 'regex', 'exists', 'not-exists']);

export function parseTestDoc(text, filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  const trimmed = text.trim();
  if (ext === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonDoc(trimmed);
  }
  return parseCsvDoc(trimmed);
}

function parseJsonDoc(text) {
  const j = JSON.parse(text);
  const tests = Array.isArray(j) ? j : Array.isArray(j.tests) ? j.tests : null;
  if (!tests) throw new Error('Expected an array or { tests: [...] } object');
  return {
    name: j.name || 'Test Suite',
    url: j.url || null,
    tests: tests.map(normalizeTest),
  };
}

function parseCsvDoc(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'));
  if (lines.length < 2) throw new Error('CSV must have a header row plus at least one test row');
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const tests = lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, j) => {
      obj[h] = cells[j] != null ? cells[j].trim() : '';
    });
    return normalizeTest({
      id: obj.id || `t${i + 1}`,
      name: obj.test_name || obj.name || `Test ${i + 1}`,
      tag: obj.tag,
      variable: obj.variable || undefined,
      assert: obj.assert || obj.operator,
      expected: obj.expected,
    });
  });
  return { name: 'CSV Test Suite', url: null, tests };
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function normalizeTest(raw) {
  if (Array.isArray(raw.conditions) && raw.conditions.length > 0) {
    return {
      id: raw.id || cryptoRandom(),
      name: raw.name || 'Unnamed test',
      logic: normalizeLogic(raw.logic),
      conditions: raw.conditions.map((c, i) => normalizeCondition(c, raw.name, i)),
    };
  }
  const cond = normalizeCondition(raw, raw.name, 0);
  return {
    id: raw.id || cryptoRandom(),
    name: raw.name || autoName([cond]),
    logic: 'and',
    conditions: [cond],
  };
}

function normalizeLogic(raw) {
  const v = String(raw || 'and').toLowerCase();
  if (v === 'or' || v === 'any') return 'or';
  return 'and';
}

function normalizeCondition(raw, testName, idx) {
  const c = {
    tag: raw.tag || raw.tagName || null,
    variable: raw.variable || raw.var || null,
    assert: (raw.assert || raw.operator || (raw.variable ? 'equals' : 'fires')).toLowerCase(),
    expected: raw.expected != null ? String(raw.expected) : '',
  };
  if (!ASSERTIONS.has(c.assert)) {
    throw new Error(`Unknown assertion "${c.assert}" on test "${testName}" (condition #${idx + 1})`);
  }
  if (!c.tag) {
    throw new Error(`Test "${testName}" condition #${idx + 1} is missing a "tag"`);
  }
  if (VAR_NEEDED.has(c.assert) && !c.variable) {
    throw new Error(`Test "${testName}" condition #${idx + 1} uses ${c.assert} but has no "variable"`);
  }
  return c;
}

function autoName(conditions) {
  if (conditions.length === 1) return autoNameOne(conditions[0]);
  return `${conditions[0].tag} (${conditions.length} conditions)`;
}

export function autoNameOne(c) {
  if (c.assert === 'fires') return `${c.tag} fires`;
  if (c.assert === 'not-fires') return `${c.tag} does NOT fire`;
  if (c.assert === 'exists') return `${c.tag} · ${c.variable} exists`;
  if (c.assert === 'not-exists') return `${c.tag} · ${c.variable} does NOT exist`;
  const op = { equals: '=', 'not-equals': '≠', contains: '⊃', 'not-contains': '⊅', regex: '~' }[c.assert] || c.assert;
  return `${c.tag} · ${c.variable} ${op} ${c.expected}`;
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10);
}

export function runTests(testDoc, capture) {
  const detection = detectTags(capture?.requests || [], capture?.url);
  const tagsByName = new Map();
  const tagsByVendor = new Map();
  for (const t of detection.tags) {
    if (!tagsByName.has(t.name)) tagsByName.set(t.name, []);
    tagsByName.get(t.name).push(t);
    if (!tagsByVendor.has(t.vendor)) tagsByVendor.set(t.vendor, []);
    tagsByVendor.get(t.vendor).push(t);
  }

  const results = (testDoc.tests || []).map((t) => runCompoundTest(t, tagsByName, tagsByVendor));
  return {
    name: testDoc.name,
    captureId: capture?.id,
    captureUrl: capture?.url,
    ranAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  };
}

function runCompoundTest(test, tagsByName, tagsByVendor) {
  const conditionResults = test.conditions.map((c) =>
    runOneCondition(c, tagsByName, tagsByVendor)
  );

  const hasError = conditionResults.some((r) => r.status === 'error');
  let status;
  if (hasError) {
    status = 'error';
  } else if (test.logic === 'or') {
    status = conditionResults.some((r) => r.status === 'pass') ? 'pass' : 'fail';
  } else {
    status = conditionResults.every((r) => r.status === 'pass') ? 'pass' : 'fail';
  }

  return {
    id: test.id,
    name: test.name,
    logic: test.logic,
    conditions: conditionResults,
    status,
    passedCount: conditionResults.filter((r) => r.status === 'pass').length,
    totalConditions: conditionResults.length,
  };
}

function runOneCondition(condition, tagsByName, tagsByVendor) {
  const matches = tagsByName.get(condition.tag) || tagsByVendor.get(condition.tag) || [];
  const fires = matches.length > 0;

  if (condition.assert === 'fires') {
    return condVerdict(condition, fires, fires ? 'detected' : 'not detected', null, fires ? 1 : 0);
  }
  if (condition.assert === 'not-fires') {
    return condVerdict(condition, !fires, !fires ? 'not detected' : `detected ${matches.length} time(s)`, null, fires ? 1 : 0);
  }
  if (!fires) {
    return condVerdict(condition, false, '(tag did not fire)', condition.expected, 0);
  }

  const found = collectVariableValues(matches, condition.variable);
  const actuals = [...found];
  const actualDisplay = actuals.length === 0 ? null : actuals.length === 1 ? actuals[0] : actuals.join(' | ');

  switch (condition.assert) {
    case 'equals':
      return condVerdict(condition, actuals.some((a) => a === condition.expected), actualDisplay, condition.expected, matches.length);
    case 'not-equals':
      return condVerdict(condition, actuals.length > 0 && !actuals.some((a) => a === condition.expected), actualDisplay, condition.expected, matches.length);
    case 'contains':
      return condVerdict(condition, actuals.some((a) => String(a).includes(condition.expected)), actualDisplay, condition.expected, matches.length);
    case 'not-contains':
      return condVerdict(condition, actuals.length > 0 && !actuals.some((a) => String(a).includes(condition.expected)), actualDisplay, condition.expected, matches.length);
    case 'regex': {
      let re;
      try { re = new RegExp(condition.expected); } catch (e) {
        return condError(condition, `Invalid regex: ${e.message}`);
      }
      return condVerdict(condition, actuals.some((a) => re.test(String(a))), actualDisplay, condition.expected, matches.length);
    }
    case 'exists':
      return condVerdict(condition, actuals.length > 0, actualDisplay || '(missing)', null, matches.length);
    case 'not-exists':
      return condVerdict(condition, actuals.length === 0, actualDisplay || '(missing)', null, matches.length);
    default:
      return condError(condition, `Unsupported assertion "${condition.assert}"`);
  }
}

function collectVariableValues(matches, variableName) {
  const found = new Set();
  for (const m of matches) {
    for (const v of m.variables || []) {
      if (v.key === variableName) {
        for (const val of v.allValues || [v.value]) {
          if (val != null) found.add(String(val));
        }
      }
    }
  }
  return found;
}

function condVerdict(condition, ok, actual, expected, requestCount) {
  return {
    tag: condition.tag,
    variable: condition.variable || null,
    assert: condition.assert,
    expected: expected != null ? String(expected) : null,
    actual: actual != null ? String(actual) : null,
    requestCount,
    status: ok ? 'pass' : 'fail',
    error: null,
  };
}

function condError(condition, message) {
  return {
    tag: condition.tag,
    variable: condition.variable || null,
    assert: condition.assert,
    expected: condition.expected,
    actual: null,
    requestCount: 0,
    status: 'error',
    error: message,
  };
}

export const SAMPLE_JSON = `{
  "name": "Example test suite",
  "url": "https://example.com/products/widget",
  "tests": [
    {
      "name": "Adobe Analytics fires on the page",
      "tag": "Adobe Analytics",
      "assert": "fires"
    },
    {
      "name": "pageName matches expected hierarchy",
      "tag": "Adobe Analytics",
      "variable": "pageName",
      "assert": "equals",
      "expected": "site:section:category:product"
    },
    {
      "name": "Either Adobe OR GA4 must fire (compound OR)",
      "logic": "or",
      "conditions": [
        { "tag": "Adobe Analytics", "assert": "fires" },
        { "tag": "Google Analytics 4", "assert": "fires" }
      ]
    },
    {
      "name": "Adobe page-view bundle (compound AND)",
      "logic": "and",
      "conditions": [
        { "tag": "Adobe Analytics", "assert": "fires" },
        { "tag": "Adobe Analytics", "variable": "prop1", "assert": "equals", "expected": "product" },
        { "tag": "Adobe Analytics", "variable": "prop2", "assert": "exists" },
        { "tag": "Adobe Analytics", "variable": "events", "assert": "contains", "expected": "prodView" }
      ]
    },
    {
      "name": "Pinterest tracks PageVisit AND has tag id",
      "logic": "and",
      "conditions": [
        { "tag": "Pinterest Tag", "variable": "event", "assert": "equals", "expected": "PageVisit" },
        { "tag": "Pinterest Tag", "variable": "tid (Tag ID)", "assert": "exists" }
      ]
    }
  ]
}
`;

export const SAMPLE_CSV = `test_name,tag,variable,assert,expected
Adobe Analytics fires,Adobe Analytics,,fires,
pageName matches,Adobe Analytics,pageName,equals,site:section:category:product
prop1 product,Adobe Analytics,prop1,equals,product
events prodView,Adobe Analytics,events,contains,prodView
Pinterest PageVisit,Pinterest Tag,event,equals,PageVisit
GA4 not on staging,Google Analytics 4,,not-fires,
`;
