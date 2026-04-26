const { chromium } = require('playwright');

/**
 * Capture all network traffic for a URL using headless Chromium.
 * Waits for page load (networkidle) before returning.
 */
async function capture(url, options = {}) {
  const { timeout = 60000, waitUntil = 'networkidle' } = options;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const requestMap = new Map(); // request object -> entry
  const requestList = [];
  let sequence = 0;

  page.on('request', (request) => {
    const entry = {
      sequence: ++sequence,
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
    requestMap.set(request, entry);
    requestList.push(entry);
  });

  page.on('response', async (response) => {
    const entry = requestMap.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.statusText = response.statusText();
    entry.responseHeaders = response.headers();
    try {
      const buffer = await response.body();
      entry.responseSize = buffer.length;
    } catch {
      // body not available for some resource types (e.g., redirects)
    }
  });

  page.on('requestfinished', (request) => {
    const entry = requestMap.get(request);
    if (!entry) return;
    entry.duration = Date.now() - entry.startTime;
  });

  page.on('requestfailed', (request) => {
    const entry = requestMap.get(request);
    if (!entry) return;
    entry.failed = true;
    entry.failureText = request.failure()?.errorText || 'Unknown error';
    entry.duration = Date.now() - entry.startTime;
  });

  const navStart = Date.now();
  let navError = null;

  try {
    await page.goto(url, { waitUntil, timeout });
  } catch (err) {
    navError = err.message;
  }

  const navEnd = Date.now();

  await browser.close();

  return {
    url,
    totalDuration: navEnd - navStart,
    requestCount: requestList.length,
    navError,
    requests: requestList,
  };
}

module.exports = { capture };
