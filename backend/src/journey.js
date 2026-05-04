const { chromium } = require('playwright');

// Browser fingerprints we rotate through per journey. Device-fingerprinting
// vendors (iOvation, Akamai Bot Manager, etc.) recognize repeat visitors by
// {user agent + viewport + locale + timezone + canvas/font hash}. We can't
// fake the canvas/font hash without a more invasive browser config, but
// rotating the easily-observable axes is enough to look like a different
// machine for most session-locking. Used by both runJourney variants.
const FINGERPRINTS = [
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'America/Los_Angeles', deviceScaleFactor: 2 },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }, locale: 'en-US', timezoneId: 'America/Chicago', deviceScaleFactor: 1 },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 }, locale: 'en-US', timezoneId: 'America/New_York', deviceScaleFactor: 1 },
  { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1536, height: 864 }, locale: 'en-US', timezoneId: 'America/Denver', deviceScaleFactor: 1 },
  { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.2277.83',
    viewport: { width: 1680, height: 1050 }, locale: 'en-US', timezoneId: 'America/Phoenix', deviceScaleFactor: 1 },
];

function pickFingerprint() {
  return FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
}

async function runJourney(definition, options = {}) {
  const {
    onStepStart = () => {},
    onStepEnd   = () => {},
  } = options;

  const headless = !!definition.headless;     // default false (visible)
  const slowMo = definition.slowMo != null ? definition.slowMo : (headless ? 0 : 250);

  // Launch a fresh Chromium per journey with HTTP cache disabled. Combined
  // with newContext() below (which always starts with no cookies / storage
  // / serviceWorkers), this guarantees every journey runs as a brand-new
  // anonymous visitor — important for tag QA so opt-outs, cookies, or
  // cached scripts from previous runs don't suppress beacons.
  const browser = await chromium.launch({
    headless,
    slowMo,
    args: [
      '--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0',
      '--incognito',
    ],
  });

  // Randomize the browser fingerprint per journey so device-recognition tools
  // (iOvation, Akamai Bot Manager, etc.) don't tag us as a returning visitor
  // when a previous run got the session stuck on an error page.
  const fingerprint = pickFingerprint();
  const context = await browser.newContext({
    userAgent: fingerprint.userAgent,
    viewport: fingerprint.viewport,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    deviceScaleFactor: fingerprint.deviceScaleFactor,
    extraHTTPHeaders: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
  const page = await context.newPage();

  // The capture buffer — accumulates requests for the *current* step.
  // We reset it after each step's capture is finalized.
  let buffer = newBuffer();

  page.on('request', (request) => {
    const entry = {
      sequence: ++buffer.sequence,
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      requestHeaders: request.headers(),
      requestBody: request.postData(),
      startTime: Date.now(),
      status: null,
      statusText: null,
      responseHeaders: null,
      responseSize: null,
      duration: null,
      failed: false,
      failureText: null,
    };
    buffer.map.set(request, entry);
    buffer.list.push(entry);
  });

  page.on('response', async (response) => {
    const entry = buffer.map.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.statusText = response.statusText();
    entry.responseHeaders = response.headers();
    try {
      const buf = await response.body();
      entry.responseSize = buf.length;
    } catch { /* body not available */ }
  });

  page.on('requestfinished', (request) => {
    const entry = buffer.map.get(request);
    if (!entry) return;
    entry.duration = Date.now() - entry.startTime;
  });

  page.on('requestfailed', (request) => {
    const entry = buffer.map.get(request);
    if (!entry) return;
    entry.failed = true;
    entry.failureText = request.failure()?.errorText || 'Unknown error';
    entry.duration = Date.now() - entry.startTime;
  });

  const journeyStart = Date.now();
  const stepResults = [];

  // The journey always starts with navigating to startUrl, then runs each
  // step's actions in order. The first step's `actions` are usually empty
  // (just landing-page capture).
  buffer = newBuffer();   // fresh buffer for the implicit-start navigation
  let navError = null;
  try {
    await page.goto(definition.startUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  } catch (err) {
    navError = err.message;
  }

  const steps = Array.isArray(definition.steps) ? definition.steps : [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = Date.now();
    onStepStart({ index: i, name: step.name });

    let stepError = null;

    // Run actions
    try {
      for (const action of step.actions || []) {
        await runAction(page, action);
      }
    } catch (err) {
      stepError = `action failed: ${err.message}`;
    }

    // Wait conditions
    if (!stepError) {
      try {
        if (step.waitFor) {
          await page.waitForSelector(step.waitFor, { timeout: step.waitTimeout || 15000 });
        }
        if (step.waitForNetworkIdle !== false) {
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        }
        if (step.waitMs) {
          await page.waitForTimeout(step.waitMs);
        }
      } catch (err) {
        stepError = `wait failed: ${err.message}`;
      }
    }

    const captureRequests = step.capture !== false;
    const result = {
      sequence: i + 1,
      name: step.name || `Step ${i + 1}`,
      urlAtCapture: page.url(),
      status: stepError ? 'failed' : 'completed',
      error: stepError,
      durationMs: Date.now() - stepStart,
      requests: captureRequests ? buffer.list : [],
    };

    // Reset buffer for next step (so each step's capture is just the
    // requests fired during that step, not cumulative)
    buffer = newBuffer();

    stepResults.push(result);
    onStepEnd(result);

    // If a step failed and journey says don't continue, bail out
    if (stepError && step.continueOnError !== true) break;
  }

  await browser.close();

  return {
    name: definition.name || 'Journey',
    startUrl: definition.startUrl,
    durationMs: Date.now() - journeyStart,
    navError,
    steps: stepResults,
  };
}

function newBuffer() {
  return { sequence: 0, list: [], map: new Map() };
}

async function runAction(page, action) {
  switch (action.type) {
    case 'goto':
      await page.goto(action.url, { waitUntil: 'load', timeout: action.timeout || 30000 });
      return;
    case 'click':
      await page.click(action.selector, { timeout: action.timeout || 10000 });
      return;
    case 'fill':
      await page.fill(action.selector, String(action.value ?? ''), { timeout: action.timeout || 10000 });
      return;
    case 'select':
      await page.selectOption(action.selector, action.value);
      return;
    case 'check':
      await page.check(action.selector);
      return;
    case 'uncheck':
      await page.uncheck(action.selector);
      return;
    case 'press':
      await page.press(action.selector, action.key);
      return;
    case 'wait':
      if (action.selector) {
        await page.waitForSelector(action.selector, { timeout: action.timeout || 15000 });
      } else if (action.ms) {
        await page.waitForTimeout(action.ms);
      }
      return;
    case 'scroll':
      await page.evaluate(({ x = 0, y = 0 }) => window.scrollBy(x, y), action);
      return;
    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// =================== AUTO-WALK MODE ===================
// User just gives a URL. We walk the flow heuristically:
//   - fill any visible required form fields with reasonable test data
//   - find the primary action button (Continue, Next, Submit, Continue as Guest, ...)
//   - click it, wait, capture, repeat
//   - stop when we hit a confirmation/success page or max steps

const PRIMARY_BUTTON_TEXTS = [
  // ordered by priority — first match wins
  'continue as guest', 'continue without signing', 'continue without login',
  'guest checkout', 'checkout as guest', 'skip',
  'get started', 'begin', 'start application', 'start',
  'agree and continue', 'i agree', 'accept and continue', 'accept',
  'continue', 'next', 'next step', 'proceed',
  'apply now', 'apply',
  'submit application', 'submit',
  'register', 'create account', 'sign up', 'signup',
  'open account', 'open an account',
  'finish',
  'no thanks', 'maybe later',
];

const TERMINAL_URL_HINTS = [
  '/confirmation', '/confirm', '/success', '/thank-you', '/thankyou',
  '/submitted', '/submit-success', '/complete', '/completed', '/done', '/finish',
  '/receipt', '/order-confirmation',
];

const TERMINAL_TEXT_HINTS = [
  'thank you', 'thanks for', 'application received', 'application submitted',
  'submission successful', 'submitted successfully', 'order confirmation',
  'your application has been', 'we have received your', 'congratulations',
  'submitted', 'all set', "you're done", 'you are done',
];

// Reasonable US-shaped fake data. Matched against field name/id/label/placeholder.
// Note: SSN/EIN defaults avoid the most common testing patterns (123-45-6789,
// 12-3456789) that banks aggressively blocklist. They're still fake, just less
// likely to fail format validation. Use journey.fieldData to override.
const FIELD_DATA = [
  { match: /first.?name|^fname|given.?name/i, value: 'Jordan' },
  { match: /last.?name|^lname|surname|family.?name/i, value: 'Sample' },
  { match: /middle.?name|^mname/i, value: '' },
  { match: /^name$|full.?name|customer.?name/i, value: 'Jordan Sample' },
  { match: /business.?name|company.?name|legal.?name|dba|^company$/i, value: 'Riverbend Holdings LLC' },
  { match: /e?mail/i, value: 'jordan.sample@example.com' },
  { match: /phone|mobile|^tel$|telephone/i, value: '4155551212' },
  { match: /^zip$|postal|postcode/i, value: '94103' },
  { match: /^city$|town/i, value: 'San Francisco' },
  { match: /address.*line.?1|^address1?$|street/i, value: '123 Market Street' },
  { match: /address.*line.?2|^address2|apt|unit|suite/i, value: '' },
  { match: /^state$|province|region/i, value: 'CA' },
  { match: /country/i, value: 'US' },
  { match: /ein|tax.?id|federal.?tax/i, value: '45-2345678' },
  { match: /ssn|social.?security/i, value: '408-12-3456' },
  { match: /dob|date.?of.?birth|birth.?date/i, value: '01/15/1985' },
  { match: /password|pwd/i, value: 'TestPass!2026' },
  { match: /username|user.?id|userid|login/i, value: 'jsample' },
  // numeric / amount fields
  { match: /amount|deposit|balance/i, value: '100' },
  { match: /^age$/i, value: '35' },
];

const FALLBACK_TEXT = 'Test';

async function autoFillForms(page, overrides = {}) {
  return await page.evaluate(({ FIELD_DATA, FALLBACK_TEXT, OVERRIDES }) => {
    const filled = [];
    function setReactValue(el, value) {
      // React/Vue often listen to specific events. Fire input + change, also
      // override the native setter so frameworks pick up the change.
      const proto = Object.getPrototypeOf(el);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function findValueFor(el) {
      const haystack = [
        el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
        el.getAttribute('data-testid'),
        el.labels && el.labels[0] ? el.labels[0].innerText : '',
      ].filter(Boolean).join(' ');
      // User-supplied overrides win over defaults. Each key is treated as a
      // case-insensitive regex matched against the haystack.
      for (const key of Object.keys(OVERRIDES || {})) {
        try {
          const re = new RegExp(key, 'i');
          if (re.test(haystack)) return OVERRIDES[key];
        } catch { /* invalid regex — skip */ }
      }
      for (const rule of FIELD_DATA) {
        const re = new RegExp(rule.match.source, rule.match.flags);
        if (re.test(haystack)) return rule.value;
      }
      return null;
    }

    // Skip hidden inputs and the obvious search/feedback widgets
    const skipNames = /search|feedback|chat|interest|consent|cookie/i;

    document.querySelectorAll('input, textarea, select').forEach((el) => {
      const visible = el.offsetParent !== null && !el.disabled && !el.readOnly;
      if (!visible) return;
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'file'].includes(type)) return;
      if (el.name && skipNames.test(el.name)) return;

      // checkboxes (typically T&C, marketing opt-in) → check 'em if required-looking
      if (type === 'checkbox') {
        const labelText = (el.labels && el.labels[0]?.innerText || '').toLowerCase();
        if (/agree|terms|consent|accept|acknowledge|understand/.test(labelText)) {
          if (!el.checked) {
            el.click();
            filled.push({ name: el.name || el.id, kind: 'check', value: 'true' });
          }
        }
        return;
      }
      if (type === 'radio') {
        // pick the first radio in the group if none selected
        if (!el.checked && el.name) {
          const peers = document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`);
          if (peers.length && ![...peers].some((r) => r.checked)) {
            peers[0].click();
            filled.push({ name: el.name, kind: 'radio', value: peers[0].value });
          }
        }
        return;
      }
      if (el.tagName === 'SELECT') {
        const isPlaceholder = (text) => {
          if (!text) return true;
          const t = text.trim().toLowerCase();
          if (t.length < 2) return true;
          return /^(select|choose|please|pick)\b/.test(t) || /^[-–—\s]+$/.test(t);
        };
        // Already has a real (non-placeholder) selection? Leave it alone.
        const current = el.options[el.selectedIndex];
        if (el.value && current && !isPlaceholder(current.text)) return;

        const haystack = [
          el.name, el.id, el.placeholder, el.getAttribute('aria-label'),
          el.getAttribute('data-testid'),
          el.labels && el.labels[0] ? el.labels[0].innerText : '',
        ].filter(Boolean).join(' ');

        // 1. If an override matches the field, try to find the matching option
        let chosen = null;
        for (const key of Object.keys(OVERRIDES || {})) {
          try {
            const re = new RegExp(key, 'i');
            if (re.test(haystack)) {
              const target = String(OVERRIDES[key]).toLowerCase().trim();
              chosen = [...el.options].find((o) => {
                if (o.disabled) return false;
                const v = (o.value || '').toLowerCase().trim();
                const t = (o.text || '').toLowerCase().trim();
                return v === target || t === target || t.includes(target) || v.includes(target);
              }) || null;
              if (chosen) break;
            }
          } catch { /* invalid regex */ }
        }

        // 2. Otherwise, first non-placeholder option with a real value
        if (!chosen) {
          chosen = [...el.options].find((o) => o.value && !o.disabled && !isPlaceholder(o.text)) || null;
        }

        if (chosen) {
          el.value = chosen.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          filled.push({
            name: el.name || el.id,
            kind: 'select',
            value: chosen.value,
            text: chosen.text,
          });
        }
        return;
      }
      if (el.value && el.value.trim()) return;   // already filled, leave alone
      let value = findValueFor(el);
      if (value === null) value = FALLBACK_TEXT;
      if (value === '') return;
      setReactValue(el, value);
      filled.push({ name: el.name || el.id || el.placeholder, kind: 'fill', value });
    });

    return filled;
  }, {
    FIELD_DATA: FIELD_DATA.map((r) => ({ match: { source: r.match.source, flags: r.match.flags }, value: r.value })),
    FALLBACK_TEXT,
    OVERRIDES: overrides || {},
  });
}

// Drive custom (non-<select>) dropdowns: react-select, Material-UI, Ant Design,
// custom React popovers, etc. We only act when an override matches the
// dropdown's label, so we never blindly click random elements.
async function fillCustomDropdowns(page, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return [];
  const filled = [];

  // Collect candidate triggers — things that act like dropdowns
  const handles = await page.$$([
    '[role="combobox"]',
    '[role="listbox"]',
    '[aria-haspopup="listbox"]',
    '[aria-haspopup="menu"]',
    '[aria-haspopup="true"]',
    'button[aria-expanded]',
    '[class*="dropdown" i]:not(option):not(li)',
    '[class*="select__control" i]',
    '[class*="MuiSelect"]',
    '[class*="ant-select"]',
  ].join(', '));

  for (const trigger of handles) {
    try {
      const visible = await trigger.isVisible().catch(() => false);
      if (!visible) continue;

      // Skip native <select> (handled separately) and submit-like buttons
      const tagName = await trigger.evaluate((el) => el.tagName).catch(() => '');
      if (tagName === 'SELECT') continue;

      const innerText = (await trigger.innerText().catch(() => '')).trim();
      if (/^\s*(submit|continue|next|register|save|finish|apply|cancel|back|go)\s*$/i.test(innerText)) continue;

      // Build a haystack from the trigger's surrounding context (label, aria,
      // siblings, fieldset legend, etc.)
      const haystack = await trigger.evaluate((el) => {
        const parts = [
          el.getAttribute('aria-label') || '',
          el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby'))?.innerText || '') : '',
          el.id || '',
          el.getAttribute('name') || '',
          (el.innerText || '').trim(),
        ];
        if (el.id) {
          const lbl = document.querySelector(`label[for="${el.id}"]`);
          if (lbl) parts.push(lbl.innerText.trim());
        }
        const parentLabel = el.closest('label');
        if (parentLabel) parts.push(parentLabel.innerText.trim());
        const prev = el.previousElementSibling;
        if (prev) parts.push((prev.innerText || '').trim());
        const group = el.closest('[role="group"], fieldset, .form-group, .field, .form-field');
        if (group) {
          const gLbl = group.querySelector('label, legend');
          if (gLbl) parts.push(gLbl.innerText.trim());
        }
        return parts.filter(Boolean).join(' ').slice(0, 400);
      }).catch(() => '');

      if (!haystack) continue;

      // Match against overrides
      let targetValue = null;
      for (const key of Object.keys(overrides)) {
        try {
          const re = new RegExp(key, 'i');
          if (re.test(haystack)) {
            targetValue = String(overrides[key]);
            break;
          }
        } catch { /* invalid regex */ }
      }
      if (!targetValue) continue;

      // Open the dropdown
      await trigger.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(350);

      // Click the option whose text matches the override (case-insensitive,
      // exact-or-contains). Try several option-locator strategies in order.
      const escaped = targetValue.replace(/"/g, '\\"');
      const lowerTarget = targetValue.toLowerCase();
      const candidates = [
        `[role="option"]:has-text("${escaped}")`,
        `[role="menuitem"]:has-text("${escaped}")`,
        `li:has-text("${escaped}")`,
        `div.option:has-text("${escaped}")`,
        `div[class*="option" i]:has-text("${escaped}")`,
      ];

      let clicked = false;
      for (const sel of candidates) {
        const loc = page.locator(sel);
        const count = await loc.count().catch(() => 0);
        if (count === 0) continue;
        // Find the visible option whose text actually matches (case-insensitive)
        for (let i = 0; i < Math.min(count, 20); i++) {
          const item = loc.nth(i);
          if (!(await item.isVisible().catch(() => false))) continue;
          const text = ((await item.innerText().catch(() => '')) || '').trim();
          const t = text.toLowerCase();
          if (t === lowerTarget || t.includes(lowerTarget) || lowerTarget.includes(t)) {
            try {
              await item.click({ timeout: 2000 });
              clicked = true;
              break;
            } catch { /* try next */ }
          }
        }
        if (clicked) break;
      }

      if (clicked) {
        filled.push({
          name: haystack.slice(0, 60),
          kind: 'custom-dropdown',
          value: targetValue,
        });
        await page.waitForTimeout(300);
      } else {
        // Couldn't find the option — close to avoid leaving the popover open
        await page.keyboard.press('Escape').catch(() => {});
      }
    } catch { /* skip and try next trigger */ }
  }

  return filled;
}

// Find the highest-priority advance-button on the page. Returns the matched
// text only (NOT an ElementHandle) — we re-resolve via Playwright locators at
// click time so React re-renders / DOM detaches don't break us.
async function findPrimaryButton(page) {
  const text = await page.evaluate((TEXTS) => {
    const candidates = [];
    const sel = 'button, a, input[type=submit], input[type=button], [role=button]';
    for (const el of document.querySelectorAll(sel)) {
      const visible = el.offsetParent !== null && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
      if (!visible) continue;
      const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
      if (!text) continue;
      const lower = text.toLowerCase();
      let priority = -1;
      for (let i = 0; i < TEXTS.length; i++) {
        if (lower === TEXTS[i] || lower.includes(TEXTS[i])) { priority = i; break; }
      }
      if (priority < 0) continue;
      candidates.push({ priority, text });
    }
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0] ? candidates[0].text : null;
  }, PRIMARY_BUTTON_TEXTS);

  return text ? { text } : null;
}

// Wait for any visible loader / spinner / overlay to disappear before
// interacting. Many React forms throw up a temporary spinner on submit that
// intercepts pointer events — clicking too fast hits the spinner, not the
// button.
async function waitForLoadersToClear(page, maxMs = 6000) {
  const sel = [
    '.loader', '.loader-container',
    '.spinner', '[class*="spinner" i]',
    '[class*="loading" i]:not([class*="not-loading" i])',
    '[aria-busy="true"]',
    '[role="alert"][aria-live="assertive"].loader-container',
  ].join(', ');
  try {
    await page.waitForFunction((selector) => {
      const els = document.querySelectorAll(selector);
      for (const el of els) {
        if (!el.offsetParent) continue;          // not in layout
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        return false;                            // a visible loader still there
      }
      return true;
    }, sel, { timeout: maxMs });
  } catch { /* loader didn't go away in time — proceed anyway */ }
}

// Click the primary advance-button using a fresh locator each attempt, so a
// React re-render between resolution and click doesn't strand us with a
// detached element. Retries once on the most common transient failures.
async function clickPrimaryButton(page, text) {
  await waitForLoadersToClear(page);

  const escaped = text.replace(/"/g, '\\"');
  const locator = page.locator(
    [
      `button:has-text("${escaped}")`,
      `a:has-text("${escaped}")`,
      `[role="button"]:has-text("${escaped}")`,
      `input[type="submit"][value*="${escaped}" i]`,
      `input[type="button"][value*="${escaped}" i]`,
    ].join(', ')
  ).first();

  try {
    await locator.click({ timeout: 12000 });
    return;
  } catch (err) {
    const msg = String(err && err.message || err);
    const transient =
      /not attached to the DOM|intercepts pointer events|element is not visible|element is not enabled|stale/i.test(msg);
    if (!transient) throw err;
    // One retry: wait for loaders again, then re-locate and click
    await page.waitForTimeout(500);
    await waitForLoadersToClear(page);
    await locator.click({ timeout: 8000 });
  }
}

// Per-page persistent overlay state. Set by waitForUserChoice while it's
// running, watched by a framenavigated listener that re-injects the overlay
// on the new page after any navigation. This solves the problem where React
// SPAs wipe our injected DOM on route transitions.
function makeOverlayLifecycle(page) {
  let active = null;          // { title, prompt, subPrompt, buttons } or null

  const inject = async () => {
    if (!active) return;
    await page.evaluate(({ title, prompt, subPrompt, buttons }) => {
      if (document.getElementById('__tagztack_pause_bar')) return;
      const bar = document.createElement('div');
      bar.id = '__tagztack_pause_bar';
      bar.style.cssText = `
        position: fixed; top: 16px; right: 16px; z-index: 2147483647;
        background: #1c1f24; color: #fff; padding: 16px 18px;
        border: 2px solid #f5c518; border-radius: 12px;
        font: 13px -apple-system, BlinkMacSystemFont, sans-serif;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        max-width: 400px; line-height: 1.45;
      `;
      const btnStyle = (kind) => {
        if (kind === 'primary') return 'flex: 1; padding: 10px 14px; background: #f5c518; color: #000; border: 0; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 13px;';
        if (kind === 'danger')  return 'padding: 10px 14px; background: transparent; color: #ff6b6b; border: 1px solid #5a3030; border-radius: 6px; cursor: pointer; font-size: 13px;';
        return 'flex: 1; padding: 10px 14px; background: transparent; color: #cfd9e6; border: 1px solid #3a3f48; border-radius: 6px; cursor: pointer; font-size: 13px;';
      };
      const buttonsHtml = buttons.map((b, i) =>
        `<button data-i="${i}" style="${btnStyle(b.kind)}">${b.label}</button>`
      ).join('');
      bar.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 6px; color: #f5c518; display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; background: #f5c518; border-radius: 50%; animation: tzPulse 1.2s infinite;"></span>
          ${title}
        </div>
        <div style="font-size: 12px; color: #cfd9e6; margin-bottom: 8px;"><strong style="color: #fff;">${prompt}</strong></div>
        ${subPrompt ? `<div style="font-size: 11px; color: #8fa8c0; margin-bottom: 14px;">${subPrompt}</div>` : '<div style="margin-bottom: 14px;"></div>'}
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">${buttonsHtml}</div>
        <style>@keyframes tzPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }</style>
      `;
      // Attach to <html> rather than <body> so React's body-level reconciliation
      // doesn't wipe us. <html>'s direct children are mostly off-limits to React.
      (document.documentElement || document.body).appendChild(bar);

      bar.querySelectorAll('button[data-i]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-i'));
          window.__tagztackChoice = buttons[idx].value;
          bar.remove();
        });
      });
    }, active).catch(() => {});
  };

  const remove = async () => {
    await page.evaluate(() => {
      document.getElementById('__tagztack_pause_bar')?.remove();
      delete window.__tagztackChoice;
    }).catch(() => {});
  };

  // Re-inject on every navigation while overlay is active. This catches the
  // common case of a React SPA navigating and re-mounting the body.
  const onNav = async (frame) => {
    if (frame !== page.mainFrame()) return;
    if (!active) return;
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300); // brief settle for React to finish mount
    await inject();
  };
  page.on('framenavigated', onNav);

  return {
    setActive: (opts) => { active = opts; },
    inject,
    remove,
    teardown: () => { active = null; page.off('framenavigated', onNav); },
  };
}

// Inject a floating control bar with arbitrary buttons. Returns the value of
// the clicked button, or 'stop' on timeout.
//
// onNavigate controls what happens if the page navigates while we're waiting:
//   'reinject' (default) — overlay is re-injected on the new page so the
//      user can make their choice there.
//   'resolve' — treat navigation as implicit acknowledgement; resolves the
//      promise with the first non-'stop' button value.
async function waitForUserChoice(page, options, lifecycle, maxWaitMs = 5 * 60 * 1000) {
  const { title = 'TagZtack walker', prompt = '', subPrompt = '', buttons = [], onNavigate = 'reinject' } = options;

  const fallback = () => {
    const b = buttons.find((bn) => bn.value !== 'stop');
    return b ? b.value : 'stop';
  };

  // Activate the persistent overlay state. The lifecycle's framenavigated
  // listener will keep re-injecting on every navigation while this is set.
  lifecycle.setActive({ title, prompt, subPrompt, buttons });

  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await lifecycle.inject();

  const start = Date.now();
  let lastUrl = page.url();

  while (Date.now() - start < maxWaitMs) {
    let choice = null;
    let overlayPresent = false;
    try {
      const probe = await page.evaluate(() => ({
        choice: window.__tagztackChoice || null,
        present: !!document.getElementById('__tagztack_pause_bar'),
      }));
      choice = probe.choice;
      overlayPresent = probe.present;
    } catch {
      // Page navigated mid-evaluate. The framenavigated listener handles
      // re-injection automatically when overlay is active.
      if (onNavigate === 'resolve') {
        lifecycle.setActive(null);
        return fallback();
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
      lastUrl = page.url();
      continue;
    }
    if (choice) {
      lifecycle.setActive(null);
      await lifecycle.remove();
      return choice;
    }

    // Detect URL change between polls
    const currentUrl = page.url();
    if (currentUrl !== lastUrl) {
      if (onNavigate === 'resolve') {
        lifecycle.setActive(null);
        return fallback();
      }
      // Listener handles re-injection; just update our tracking
      lastUrl = currentUrl;
    } else if (!overlayPresent) {
      // Overlay vanished without navigation (SPA re-render). Force a re-inject.
      await lifecycle.inject();
    }

    await page.waitForTimeout(200);
  }
  lifecycle.setActive(null);
  await lifecycle.remove();

  await page.evaluate(() => {
    document.getElementById('__tagztack_pause_bar')?.remove();
    delete window.__tagztackChoice;
  }).catch(() => {});

  return 'stop';
}

async function detectTerminal(page) {
  const url = page.url();
  if (TERMINAL_URL_HINTS.some((h) => url.toLowerCase().includes(h))) {
    return { reason: `URL contains "${TERMINAL_URL_HINTS.find((h) => url.toLowerCase().includes(h))}"` };
  }
  const found = await page.evaluate((hints) => {
    const text = document.body ? document.body.innerText.toLowerCase().slice(0, 4000) : '';
    for (const h of hints) {
      if (text.includes(h)) return h;
    }
    return null;
  }, TERMINAL_TEXT_HINTS);
  if (found) return { reason: `page contains "${found}"` };
  return null;
}

async function autoWalkJourney(definition, options = {}) {
  const headless = !!definition.headless;
  const slowMo = definition.slowMo != null ? definition.slowMo : (headless ? 0 : 250);
  let maxSteps = definition.maxSteps || 50;
  const stepExtension = definition.stepExtension || 25;
  // After each click we wait for `load` and an 8s networkidle attempt — but
  // SPAs often don't refire `load` and can finish networkidle before late
  // page-view beacons (Adobe Analytics, GA4, FB Pixel etc.) actually fire.
  // settleMs is a fixed extra pause to give those tags time to land before
  // we close the step's capture window. Default 3000ms.
  const settleMs = definition.settleMs != null ? definition.settleMs : 3000;
  const onStep = typeof options.onStep === 'function' ? options.onStep : () => {};
  // Interactive mode: when the browser is visible, after each page loads we
  // ask the user how to handle that page — Auto-fill, Manual, or Stop. The
  // walker is a co-pilot, not a self-driver. Step-through is the default
  // when visible; can be disabled to fall back to fully autonomous walking.
  const interactive = headless ? false : (definition.interactive !== false);
  const stepThrough = headless ? false : (definition.stepThrough !== false);

  // Launch a fresh Chromium per journey with HTTP cache disabled. Combined
  // with newContext() below (which always starts with no cookies / storage
  // / serviceWorkers), this guarantees every journey runs as a brand-new
  // anonymous visitor — important for tag QA so opt-outs, cookies, or
  // cached scripts from previous runs don't suppress beacons.
  const browser = await chromium.launch({
    headless,
    slowMo,
    args: [
      '--disable-application-cache', '--disk-cache-size=0', '--media-cache-size=0',
      '--incognito',
    ],
  });

  // Randomize the browser fingerprint per journey so device-recognition tools
  // (iOvation, Akamai Bot Manager, etc.) don't tag us as a returning visitor
  // when a previous run got the session stuck on an error page.
  const fingerprint = pickFingerprint();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  let buffer = newBuffer();
  attachListeners(page, () => buffer);

  const journeyStart = Date.now();
  const stepResults = [];
  let stoppedReason = null;

  // Helper: emit each step both into the in-memory results array and to the
  // streaming onStep callback so the server can persist + expose live
  // progress to the frontend.
  const pushStep = (step) => { stepResults.push(step); try { onStep(step); } catch {} };

  // Step 1 — land on URL and capture
  buffer = newBuffer();
  let stepStart = Date.now();
  let navError = null;
  try {
    await page.goto(definition.startUrl, { waitUntil: 'load', timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  } catch (err) { navError = err.message; }

  const normPath = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return u; } };
  const visitedFingerprints = new Map(); // fingerprint -> count
  let lastUrl = page.url();
  const initialFingerprint = await pageFingerprint(page);
  visitedFingerprints.set(initialFingerprint, 1);

  pushStep({
    sequence: 1,
    name: (await safeTitle(page)) || 'Landing page',
    urlAtCapture: lastUrl,
    status: navError ? 'failed' : 'completed',
    error: navError,
    durationMs: Date.now() - stepStart,
    requests: buffer.list,
    actionTaken: null,
  });

  if (navError) {
    await browser.close();
    return finalize(definition, stepResults, journeyStart, navError, 'navigation failed');
  }

  let lastStepWasManual = false;

  // Set up the persistent overlay lifecycle: a single framenavigated
  // listener that re-injects whatever overlay is currently active. Used by
  // every step-through prompt below.
  const overlayLifecycle = interactive ? makeOverlayLifecycle(page) : null;

  // Loop: fill forms, click primary button, repeat. We use a while so the
  // user can extend maxSteps mid-journey when we hit the boundary.
  let i = 2;
  while (true) {
    if (i > maxSteps) {
      // Hit the step limit — give the user a chance to extend.
      if (interactive && stepThrough) {
        const choice = await waitForUserChoice(page, {
          title: '⏸ Reached step limit',
          prompt: `Walked ${i - 1} pages. Keep going?`,
          subPrompt: `You can continue another <strong>${stepExtension}</strong> pages, or stop the journey here. All ${i - 1} captured pages are already saved either way.`,
          buttons: [
            { label: `▶ Continue another ${stepExtension} pages`, value: 'continue', kind: 'primary' },
            { label: '✕ Stop here', value: 'stop', kind: 'danger' },
          ],
        }, overlayLifecycle);
        if (choice === 'continue') {
          maxSteps += stepExtension;
          // fall through into the regular iteration body
        } else {
          stoppedReason = `reached step limit (${maxSteps - stepExtension}); user chose to stop`;
          break;
        }
      } else {
        stoppedReason = `reached max ${maxSteps} steps`;
        break;
      }
    }
    // In autonomous (non-step-through) mode, auto-detect when we've reached
    // a confirmation page. In step-through, the user is driving and decides
    // when to stop — never auto-terminate, otherwise a page containing
    // "thank you" in unrelated copy would prematurely end the journey.
    if (!stepThrough) {
      const terminal = await detectTerminal(page);
      if (terminal) {
        stoppedReason = `reached confirmation: ${terminal.reason}`;
        break;
      }
    }

    // Step-through mode: ask the user how to handle this page before doing
    // anything. They can let us auto-fill, take over manually, or stop.
    if (stepThrough) {
      const choice = await waitForUserChoice(page, {
        title: `TagZtack — page ${i}`,
        prompt: 'How should I handle this page?',
        subPrompt: `<code style="background:#0f1115;color:#f5c518;padding:1px 6px;border-radius:3px;font-size:11px;">${page.url().slice(0, 80)}</code>`,
        buttons: [
          { label: '🤖 Auto-fill & continue', value: 'auto', kind: 'primary' },
          { label: '✋ I\'ll do it manually', value: 'manual' },
          { label: '✕ Stop', value: 'stop', kind: 'danger' },
        ],
      }, overlayLifecycle);

      if (choice === 'stop') { stoppedReason = 'user stopped from step-through prompt'; break; }

      if (choice === 'manual') {
        // User takes over. Reset the buffer so this step's capture is just
        // what fires while they're acting; then wait for them to click
        // Continue, capture the page they ended up on.
        buffer = newBuffer();
        const manualStart = Date.now();

        const continueChoice = await waitForUserChoice(page, {
          title: '✋ Manual mode',
          prompt: 'You\'re driving. Fill the form and click Save / Continue / Next yourself.',
          subPrompt: 'When the next page loads, we\'ll auto-capture it and ask what to do next. Or hit the button below to capture immediately.',
          buttons: [
            { label: '▶ Capture now', value: 'done', kind: 'primary' },
            { label: '✕ Stop', value: 'stop', kind: 'danger' },
          ],
          onNavigate: 'resolve',
        }, overlayLifecycle);

        if (continueChoice === 'stop') { stoppedReason = 'user stopped during manual mode'; break; }

        // The user almost certainly clicked the form's submit button which
        // is still navigating. Wait for the new page to fully load before
        // capturing and before the next iteration's overlay tries to inject.
        await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        if (settleMs > 0) await page.waitForTimeout(settleMs);

        const newUrl = page.url();
        const stepName = (await safeTitle(page)) || `Step ${i} (manual)`;
        const fp = await pageFingerprint(page);
        visitedFingerprints.set(fp, (visitedFingerprints.get(fp) || 0) + 1);
        lastUrl = newUrl;
        lastStepWasManual = true;

        pushStep({
          sequence: i,
          name: stepName,
          urlAtCapture: newUrl,
          status: 'completed',
          error: null,
          durationMs: Date.now() - manualStart,
          requests: buffer.list,
          actionTaken: { kind: 'manual', text: '(user-driven)', fieldsFilled: 0, fills: [] },
        });
        i++;
        continue; // next iteration's prompt
      }
      // else: 'auto' — fall through to existing fill + click logic below
      lastStepWasManual = false;
    }

    // Fill the page in three passes:
    //   1. Native inputs and <select> elements (autoFillForms)
    //   2. Custom React/Vue dropdowns that need click-open + click-option
    //      (fillCustomDropdowns) — only acts when overrides match the label
    //   3. Native inputs again, in case picking a dropdown value just
    //      revealed additional conditional fields (EIN under LLC, etc.)
    let filled = [];
    try {
      const pass1 = await autoFillForms(page, definition.fieldData);
      if (pass1.length) filled.push(...pass1);

      const customs = await fillCustomDropdowns(page, definition.fieldData);
      if (customs.length) {
        filled.push(...customs);
        // Custom dropdown selection often reveals more fields async
        await page.waitForTimeout(600);
      }

      if (pass1.length > 0 || customs.length > 0) {
        await page.waitForTimeout(400);
        const pass3 = await autoFillForms(page, definition.fieldData);
        if (pass3.length) filled.push(...pass3);
      }
    } catch (e) { /* form-fill failed; continue */ }

    // Find a button to click
    let button = await findPrimaryButton(page);
    if (!button) {
      if (interactive) {
        const choice = await waitForUserChoice(page, {
          title: '⏸ No button found',
          prompt: "I can't find a button I recognize on this page.",
          subPrompt: 'Click whatever you need to on the page yourself, then hit Continue to resume.',
          buttons: [
            { label: '▶ Continue', value: 'continue', kind: 'primary' },
            { label: '✕ Stop', value: 'stop', kind: 'danger' },
          ],
          onNavigate: 'resolve',
        }, overlayLifecycle);
        if (choice === 'continue') {
          // Record the manual step at the current state, then loop again to
          // discover the new page from a clean slate.
          const stepName = (await safeTitle(page)) || `Step ${i} (manual)`;
          pushStep({
            sequence: i,
            name: stepName,
            urlAtCapture: page.url(),
            status: 'completed',
            error: null,
            durationMs: Date.now() - stepStart,
            requests: buffer.list,
            actionTaken: { kind: 'manual', text: '(user intervened)', fieldsFilled: 0, fills: [] },
          });
          buffer = newBuffer();
          lastUrl = page.url();
          // Refresh fingerprint tracking from the user's new state
          const fp = await pageFingerprint(page);
          visitedFingerprints.set(fp, 1);
          i++;
          continue;
        }
      }
      stoppedReason = 'no primary button found (maybe end of flow or unrecognized layout)';
      break;
    }

    // Reset buffer for this new step
    buffer = newBuffer();
    stepStart = Date.now();
    let stepError = null;

    try {
      await Promise.all([
        page.waitForLoadState('load', { timeout: 15000 }).catch(() => {}),
        clickPrimaryButton(page, button.text),
      ]);
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      // Extra fixed settle so SPA-fired page-view beacons (Adobe, GA4, FB,
      // Pinterest) have time to land before we close this step's capture.
      if (settleMs > 0) await page.waitForTimeout(settleMs);
    } catch (err) {
      stepError = `click "${button.text}" failed: ${err.message}`;
    }

    const newUrl = page.url();
    const fingerprint = await pageFingerprint(page);
    const visitCount = (visitedFingerprints.get(fingerprint) || 0) + 1;
    visitedFingerprints.set(fingerprint, visitCount);
    lastUrl = newUrl;

    const stepName = (await safeTitle(page)) || `Step ${i}`;
    pushStep({
      sequence: i,
      name: stepName,
      urlAtCapture: newUrl,
      status: stepError ? 'failed' : 'completed',
      error: stepError,
      durationMs: Date.now() - stepStart,
      requests: buffer.list,
      actionTaken: {
        kind: 'click',
        text: button.text,
        fieldsFilled: filled.length,
        fills: filled,
      },
    });

    if (stepError) { stoppedReason = stepError; break; }
    // Loop guard: bail only if we've landed on the SAME page (URL + title +
    // heading) more than once. SPAs that keep the URL constant but change
    // their content will produce different fingerprints between steps, so
    // this won't false-positive on legitimate multi-step SPAs.
    // Skip the guard if the previous step was manual — the user is in
    // control and might intentionally stay on the same page to fill more.
    if (visitCount >= 2 && !lastStepWasManual) {
      if (interactive) {
        const choice = await waitForUserChoice(page, {
          title: '⏸ Looks stuck',
          prompt: `Form bounced back to ${normPath(newUrl)}.`,
          subPrompt: 'Probably a validation error. Fix it on the page, then hit Continue to resume.',
          buttons: [
            { label: '▶ Continue', value: 'continue', kind: 'primary' },
            { label: '✕ Stop', value: 'stop', kind: 'danger' },
          ],
          onNavigate: 'resolve',
        }, overlayLifecycle);
        if (choice === 'continue') {
          // Reset fingerprint tracking for this page so the user gets a clean
          // re-attempt — they presumably fixed the validation issue.
          visitedFingerprints.set(fingerprint, 1);
          // Re-fingerprint the page in case the user navigated away or the
          // page has a new state after their intervention.
          const fp = await pageFingerprint(page);
          visitedFingerprints.set(fp, 1);
          i++;
          continue;
        }
      }
      stoppedReason = `stuck — revisited ${normPath(newUrl)} with same title/heading (likely a validation error or auth wall)`;
      break;
    }

    i++;
  }

  if (overlayLifecycle) overlayLifecycle.teardown();
  await browser.close();
  return finalize(definition, stepResults, journeyStart, null, stoppedReason || `reached max ${maxSteps} steps`);
}

function finalize(definition, stepResults, journeyStart, navError, stoppedReason) {
  return {
    name: definition.name || `Auto-walk: ${definition.startUrl}`,
    startUrl: definition.startUrl,
    durationMs: Date.now() - journeyStart,
    navError,
    stoppedReason,
    steps: stepResults,
  };
}

async function safeTitle(page) {
  try {
    const t = await page.title();
    return t && t.trim() ? t.trim().slice(0, 60) : null;
  } catch { return null; }
}

// A "page fingerprint" combines URL path, document title, and the first
// visible heading. Two captures with the same fingerprint are almost
// certainly the same page (which is how we detect a stuck loop). SPAs that
// keep their URL constant but swap the heading/title between steps will
// produce DIFFERENT fingerprints — so we don't false-positive on them.
async function pageFingerprint(page) {
  try {
    const url = page.url();
    let path;
    try { const x = new URL(url); path = x.origin + x.pathname.replace(/\/$/, ''); }
    catch { path = url; }

    const { title, heading } = await page.evaluate(() => {
      function visibleText(el) {
        if (!el) return '';
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return '';
        return (el.innerText || '').trim().slice(0, 120);
      }
      const heading = visibleText(document.querySelector('h1'))
        || visibleText(document.querySelector('h2'))
        || visibleText(document.querySelector('[role=heading]'))
        || '';
      return { title: (document.title || '').trim().slice(0, 120), heading };
    });

    return `${path}|${title}|${heading}`;
  } catch {
    return page.url();
  }
}

function attachListeners(page, getBuffer) {
  page.on('request', (request) => {
    const buffer = getBuffer();
    const entry = {
      sequence: ++buffer.sequence,
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      requestHeaders: request.headers(),
      requestBody: request.postData(),
      startTime: Date.now(),
      status: null, statusText: null,
      responseHeaders: null, responseSize: null, duration: null,
      failed: false, failureText: null,
    };
    buffer.map.set(request, entry);
    buffer.list.push(entry);
  });
  page.on('response', async (response) => {
    const buffer = getBuffer();
    const entry = buffer.map.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.statusText = response.statusText();
    entry.responseHeaders = response.headers();
    try { entry.responseSize = (await response.body()).length; } catch {}
  });
  page.on('requestfinished', (request) => {
    const buffer = getBuffer();
    const entry = buffer.map.get(request);
    if (entry) entry.duration = Date.now() - entry.startTime;
  });
  page.on('requestfailed', (request) => {
    const buffer = getBuffer();
    const entry = buffer.map.get(request);
    if (!entry) return;
    entry.failed = true;
    entry.failureText = request.failure()?.errorText || 'Unknown error';
    entry.duration = Date.now() - entry.startTime;
  });
}

module.exports = { runJourney, autoWalkJourney };
