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
`);

module.exports = db;
