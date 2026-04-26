const express = require('express');
const cors = require('cors');
const db = require('./db');
const { capture } = require('./capture');

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
