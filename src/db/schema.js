const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

function getDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.join(DATA_DIR, 'boatsync.db');
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  migrate(db);

  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS boats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      boat_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      ical_url TEXT NOT NULL,
      last_synced_at TEXT,
      last_error TEXT,
      sync_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (boat_id) REFERENCES boats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL,
      boat_id TEXT NOT NULL,
      uid TEXT,
      summary TEXT,
      description TEXT,
      location TEXT,
      start_dt TEXT NOT NULL,
      end_dt TEXT NOT NULL,
      all_day INTEGER DEFAULT 0,
      raw_ical TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
      FOREIGN KEY (boat_id) REFERENCES boats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      boat_id TEXT NOT NULL,
      event_a_id TEXT NOT NULL,
      event_b_id TEXT NOT NULL,
      overlap_start TEXT NOT NULL,
      overlap_end TEXT NOT NULL,
      resolved INTEGER DEFAULT 0,
      resolved_at TEXT,
      detected_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (boat_id) REFERENCES boats(id) ON DELETE CASCADE,
      FOREIGN KEY (event_a_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (event_b_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id TEXT NOT NULL,
      started_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      status TEXT,
      events_found INTEGER DEFAULT 0,
      events_added INTEGER DEFAULT 0,
      events_updated INTEGER DEFAULT 0,
      events_removed INTEGER DEFAULT 0,
      error TEXT,
      FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_events_boat_id ON events(boat_id);
    CREATE INDEX IF NOT EXISTS idx_events_feed_id ON events(feed_id);
    CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_dt, end_dt);
    CREATE INDEX IF NOT EXISTS idx_feeds_boat_id ON feeds(boat_id);
    CREATE INDEX IF NOT EXISTS idx_conflicts_boat_id ON conflicts(boat_id);
  `);
}

module.exports = { getDb };
