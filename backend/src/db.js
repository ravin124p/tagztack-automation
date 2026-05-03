const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    status TEXT NOT NULL,
    request_count INTEGER DEFAULT 0,
    total_duration_ms INTEGER,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    capture_id INTEGER NOT NULL,
    sequence INTEGER,
    url TEXT NOT NULL,
    method TEXT,
    resource_type TEXT,
    status INTEGER,
    status_text TEXT,
    request_headers TEXT,
    request_body TEXT,
    response_headers TEXT,
    response_size INTEGER,
    duration_ms INTEGER,
    failed INTEGER DEFAULT 0,
    failure_text TEXT,
    FOREIGN KEY (capture_id) REFERENCES captures(id)
  );

  CREATE INDEX IF NOT EXISTS idx_requests_capture ON requests(capture_id);

  CREATE TABLE IF NOT EXISTS journeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    start_url TEXT,
    definition TEXT,
    status TEXT NOT NULL,
    duration_ms INTEGER,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS journey_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    name TEXT,
    url_at_capture TEXT,
    capture_id INTEGER,
    status TEXT,
    error TEXT,
    duration_ms INTEGER,
    action_taken TEXT,
    FOREIGN KEY (journey_id) REFERENCES journeys(id),
    FOREIGN KEY (capture_id) REFERENCES captures(id)
  );

  -- migration: add action_taken column if upgrading from older schema
  -- (better-sqlite3 doesn't have IF NOT EXISTS for ALTER, so we wrap)


  CREATE INDEX IF NOT EXISTS idx_journey_steps_journey ON journey_steps(journey_id);
`);

// Runtime migrations for users who created the DB before action_taken existed.
const stepCols = db.prepare("PRAGMA table_info('journey_steps')").all().map((c) => c.name);
if (!stepCols.includes('action_taken')) {
  db.exec("ALTER TABLE journey_steps ADD COLUMN action_taken TEXT");
}

module.exports = db;
