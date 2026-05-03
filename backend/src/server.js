const express = require('express');
const cors = require('cors');
const db = require('./db');
const { capture } = require('./capture');
const { runJourney, autoWalkJourney } = require('./journey');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Trigger a new capture ------------------------------------------------
app.post('/api/captures', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  const insertCapture = db.prepare(
    'INSERT INTO captures (url, status) VALUES (?, ?)'
  );
  const captureId = insertCapture.run(url, 'running').lastInsertRowid;

  try {
    const data = await capture(url);

    db.prepare(
      `UPDATE captures
         SET status = ?, request_count = ?, total_duration_ms = ?, error = ?
       WHERE id = ?`
    ).run(
      'completed',
      data.requestCount,
      data.totalDuration,
      data.navError,
      captureId
    );

    const insertReq = db.prepare(`
      INSERT INTO requests (
        capture_id, sequence, url, method, resource_type,
        status, status_text, request_headers, request_body,
        response_headers, response_size, duration_ms, failed, failure_text
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((reqs) => {
      for (const r of reqs) {
        insertReq.run(
          captureId,
          r.sequence,
          r.url,
          r.method,
          r.resourceType,
          r.status,
          r.statusText,
          JSON.stringify(r.requestHeaders || {}),
          r.requestBody,
          JSON.stringify(r.responseHeaders || {}),
          r.responseSize,
          r.duration,
          r.failed ? 1 : 0,
          r.failureText
        );
      }
    });
    insertMany(data.requests);

    res.json({ id: captureId, ...data });
  } catch (err) {
    db.prepare('UPDATE captures SET status = ?, error = ? WHERE id = ?').run(
      'failed',
      err.message,
      captureId
    );
    res.status(500).json({ error: err.message });
  }
});

// --- List captures --------------------------------------------------------
app.get('/api/captures', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM captures ORDER BY created_at DESC LIMIT 100')
    .all();
  res.json(rows);
});

// --- Get capture details with all requests --------------------------------
app.get('/api/captures/:id', (req, res) => {
  const capture = db
    .prepare('SELECT * FROM captures WHERE id = ?')
    .get(req.params.id);
  if (!capture) return res.status(404).json({ error: 'not found' });

  const rows = db
    .prepare('SELECT * FROM requests WHERE capture_id = ? ORDER BY sequence')
    .all(req.params.id);

  const requests = rows.map((r) => ({
    ...r,
    request_headers: safeParse(r.request_headers),
    response_headers: safeParse(r.response_headers),
    failed: !!r.failed,
  }));

  res.json({ ...capture, requests });
});

// --- Delete a capture -----------------------------------------------------
app.delete('/api/captures/:id', (req, res) => {
  db.prepare('DELETE FROM requests WHERE capture_id = ?').run(req.params.id);
  db.prepare('DELETE FROM captures WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Journeys =============================================================

const insertCaptureRow = db.prepare(
  'INSERT INTO captures (url, status, request_count, total_duration_ms, error) VALUES (?, ?, ?, ?, ?)'
);
const insertRequest = db.prepare(`
  INSERT INTO requests (
    capture_id, sequence, url, method, resource_type,
    status, status_text, request_headers, request_body,
    response_headers, response_size, duration_ms, failed, failure_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function persistStepCapture(stepResult) {
  const requests = stepResult.requests || [];
  const captureId = insertCaptureRow.run(
    stepResult.urlAtCapture || '',
    stepResult.status === 'completed' ? 'completed' : 'failed',
    requests.length,
    stepResult.durationMs,
    stepResult.error
  ).lastInsertRowid;

  const insertMany = db.transaction((reqs) => {
    for (const r of reqs) {
      insertRequest.run(
        captureId,
        r.sequence,
        r.url,
        r.method,
        r.resourceType,
        r.status,
        r.statusText,
        JSON.stringify(r.requestHeaders || {}),
        r.requestBody,
        JSON.stringify(r.responseHeaders || {}),
        r.responseSize,
        r.duration,
        r.failed ? 1 : 0,
        r.failureText
      );
    }
  });
  insertMany(requests);

  return captureId;
}

app.post('/api/journeys', async (req, res) => {
  const definition = req.body || {};
  // accept either { url } (auto-walk) or { startUrl } (legacy / scripted)
  if (definition.url && !definition.startUrl) definition.startUrl = definition.url;
  if (!definition.startUrl) {
    return res.status(400).json({ error: 'url is required' });
  }

  const isScripted = Array.isArray(definition.steps) && definition.steps.length > 0;
  const mode = isScripted ? 'scripted' : 'auto-walk';

  const journeyId = db.prepare(
    'INSERT INTO journeys (name, start_url, definition, status) VALUES (?, ?, ?, ?)'
  ).run(
    definition.name || (isScripted ? 'Scripted journey' : `Auto-walk: ${definition.startUrl}`),
    definition.startUrl,
    JSON.stringify({ ...definition, _mode: mode }),
    'running'
  ).lastInsertRowid;

  const insertStep = db.prepare(
    `INSERT INTO journey_steps
     (journey_id, sequence, name, url_at_capture, capture_id, status, error, duration_ms, action_taken)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Stream each step into the DB the moment it captures, so the frontend
  // can poll /api/journeys/:id and see new steps appear during the run.
  const persistStep = (step) => {
    try {
      const captureId = persistStepCapture(step);
      insertStep.run(
        journeyId,
        step.sequence,
        step.name,
        step.urlAtCapture,
        captureId,
        step.status,
        step.error,
        step.durationMs,
        step.actionTaken ? JSON.stringify(step.actionTaken) : null
      );
    } catch (e) {
      console.error('persistStep failed:', e.message);
    }
  };

  // Return the journey id immediately so the frontend can start polling. The
  // walker runs asynchronously in the background; each step persists itself
  // via the persistStep callback so polling /api/journeys/:id will see new
  // steps appear as the run progresses.
  res.json({ id: journeyId, mode, status: 'running' });

  (async () => {
    try {
      const result = isScripted
        ? await runJourney(definition, { onStepEnd: persistStep })
        : await autoWalkJourney(definition, { onStep: persistStep });

      const finalError = result.navError || result.stoppedReason || null;
      db.prepare('UPDATE journeys SET status = ?, duration_ms = ?, error = ? WHERE id = ?')
        .run(result.navError ? 'failed' : 'completed', result.durationMs, finalError, journeyId);
    } catch (err) {
      console.error('journey runner failed:', err);
      db.prepare('UPDATE journeys SET status = ?, error = ? WHERE id = ?')
        .run('failed', err.message, journeyId);
    }
  })();
});

app.get('/api/journeys', (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, start_url, status, duration_ms, error, created_at FROM journeys ORDER BY created_at DESC LIMIT 50'
  ).all();
  res.json(rows);
});

app.get('/api/journeys/:id', (req, res) => {
  const journey = db.prepare('SELECT * FROM journeys WHERE id = ?').get(req.params.id);
  if (!journey) return res.status(404).json({ error: 'not found' });

  const steps = db.prepare(
    'SELECT * FROM journey_steps WHERE journey_id = ? ORDER BY sequence'
  ).all(req.params.id);

  const stepDetails = steps.map((step) => {
    const action_taken = step.action_taken ? safeParse(step.action_taken) : null;
    if (!step.capture_id) return { ...step, action_taken, capture: null };
    const capture = db.prepare('SELECT * FROM captures WHERE id = ?').get(step.capture_id);
    const reqs = db.prepare(
      'SELECT * FROM requests WHERE capture_id = ? ORDER BY sequence'
    ).all(step.capture_id).map((r) => ({
      ...r,
      request_headers: safeParse(r.request_headers),
      response_headers: safeParse(r.response_headers),
      failed: !!r.failed,
    }));
    return { ...step, action_taken, capture: capture ? { ...capture, requests: reqs } : null };
  });

  res.json({
    ...journey,
    definition: safeParse(journey.definition),
    steps: stepDetails,
  });
});

app.delete('/api/journeys/:id', (req, res) => {
  const steps = db.prepare(
    'SELECT capture_id FROM journey_steps WHERE journey_id = ?'
  ).all(req.params.id);
  for (const s of steps) {
    if (s.capture_id) {
      db.prepare('DELETE FROM requests WHERE capture_id = ?').run(s.capture_id);
      db.prepare('DELETE FROM captures WHERE id = ?').run(s.capture_id);
    }
  }
  db.prepare('DELETE FROM journey_steps WHERE journey_id = ?').run(req.params.id);
  db.prepare('DELETE FROM journeys WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Helpers --------------------------------------------------------------

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
