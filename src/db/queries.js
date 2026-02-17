const { v4: uuidv4 } = require('uuid');

class BoatSyncDB {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Boats
    this.stmts = {
      insertBoat: this.db.prepare(`
        INSERT INTO boats (id, name, description) VALUES (?, ?, ?)
      `),
      updateBoat: this.db.prepare(`
        UPDATE boats SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?
      `),
      deleteBoat: this.db.prepare(`DELETE FROM boats WHERE id = ?`),
      getBoat: this.db.prepare(`SELECT * FROM boats WHERE id = ?`),
      listBoats: this.db.prepare(`SELECT * FROM boats ORDER BY created_at DESC`),

      // Feeds
      insertFeed: this.db.prepare(`
        INSERT INTO feeds (id, boat_id, platform, name, ical_url) VALUES (?, ?, ?, ?, ?)
      `),
      updateFeed: this.db.prepare(`
        UPDATE feeds SET platform = ?, name = ?, ical_url = ?, updated_at = datetime('now') WHERE id = ?
      `),
      deleteFeed: this.db.prepare(`DELETE FROM feeds WHERE id = ?`),
      getFeed: this.db.prepare(`SELECT * FROM feeds WHERE id = ?`),
      listFeedsByBoat: this.db.prepare(`SELECT * FROM feeds WHERE boat_id = ? ORDER BY platform`),
      listAllFeeds: this.db.prepare(`SELECT * FROM feeds ORDER BY boat_id, platform`),
      updateFeedSyncStatus: this.db.prepare(`
        UPDATE feeds SET sync_status = ?, last_synced_at = datetime('now'), last_error = ?, updated_at = datetime('now') WHERE id = ?
      `),

      // Events
      insertEvent: this.db.prepare(`
        INSERT INTO events (id, feed_id, boat_id, uid, summary, description, location, start_dt, end_dt, all_day, raw_ical)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      deleteEventsByFeed: this.db.prepare(`DELETE FROM events WHERE feed_id = ?`),
      getEventsByBoat: this.db.prepare(`
        SELECT e.*, f.platform, f.name as feed_name
        FROM events e JOIN feeds f ON e.feed_id = f.id
        WHERE e.boat_id = ?
        ORDER BY e.start_dt
      `),
      getEventsByBoatInRange: this.db.prepare(`
        SELECT e.*, f.platform, f.name as feed_name
        FROM events e JOIN feeds f ON e.feed_id = f.id
        WHERE e.boat_id = ? AND e.end_dt >= ? AND e.start_dt <= ?
        ORDER BY e.start_dt
      `),
      getEventsByFeedExcluded: this.db.prepare(`
        SELECT e.*, f.platform, f.name as feed_name
        FROM events e JOIN feeds f ON e.feed_id = f.id
        WHERE e.boat_id = ? AND e.feed_id != ?
        ORDER BY e.start_dt
      `),
      getAllEvents: this.db.prepare(`
        SELECT e.*, f.platform, f.name as feed_name
        FROM events e JOIN feeds f ON e.feed_id = f.id
        ORDER BY e.start_dt
      `),
      countEventsByFeed: this.db.prepare(`SELECT COUNT(*) as count FROM events WHERE feed_id = ?`),

      // Conflicts
      insertConflict: this.db.prepare(`
        INSERT INTO conflicts (id, boat_id, event_a_id, event_b_id, overlap_start, overlap_end) VALUES (?, ?, ?, ?, ?, ?)
      `),
      deleteConflictsByBoat: this.db.prepare(`DELETE FROM conflicts WHERE boat_id = ? AND resolved = 0`),
      getUnresolvedConflicts: this.db.prepare(`
        SELECT c.*,
          ea.summary as event_a_summary, ea.start_dt as event_a_start, ea.end_dt as event_a_end,
          fa.platform as event_a_platform, fa.name as event_a_feed,
          eb.summary as event_b_summary, eb.start_dt as event_b_start, eb.end_dt as event_b_end,
          fb.platform as event_b_platform, fb.name as event_b_feed
        FROM conflicts c
        JOIN events ea ON c.event_a_id = ea.id
        JOIN feeds fa ON ea.feed_id = fa.id
        JOIN events eb ON c.event_b_id = eb.id
        JOIN feeds fb ON eb.feed_id = fb.id
        WHERE c.boat_id = ? AND c.resolved = 0
        ORDER BY c.detected_at DESC
      `),
      resolveConflict: this.db.prepare(`
        UPDATE conflicts SET resolved = 1, resolved_at = datetime('now') WHERE id = ?
      `),
      getAllUnresolvedConflicts: this.db.prepare(`
        SELECT c.*,
          b.name as boat_name,
          ea.summary as event_a_summary, ea.start_dt as event_a_start, ea.end_dt as event_a_end,
          fa.platform as event_a_platform,
          eb.summary as event_b_summary, eb.start_dt as event_b_start, eb.end_dt as event_b_end,
          fb.platform as event_b_platform
        FROM conflicts c
        JOIN boats b ON c.boat_id = b.id
        JOIN events ea ON c.event_a_id = ea.id
        JOIN feeds fa ON ea.feed_id = fa.id
        JOIN events eb ON c.event_b_id = eb.id
        JOIN feeds fb ON eb.feed_id = fb.id
        WHERE c.resolved = 0
        ORDER BY c.detected_at DESC
      `),

      // Sync log
      insertSyncLog: this.db.prepare(`
        INSERT INTO sync_log (feed_id, status) VALUES (?, 'running')
      `),
      updateSyncLog: this.db.prepare(`
        UPDATE sync_log SET finished_at = datetime('now'), status = ?, events_found = ?, events_added = ?, events_updated = ?, events_removed = ?, error = ? WHERE id = ?
      `),
      getRecentSyncLogs: this.db.prepare(`
        SELECT sl.*, f.platform, f.name as feed_name, b.name as boat_name
        FROM sync_log sl
        JOIN feeds f ON sl.feed_id = f.id
        JOIN boats b ON f.boat_id = b.id
        ORDER BY sl.started_at DESC LIMIT ?
      `),
    };
  }

  // === Boats ===
  createBoat(name, description = '') {
    const id = uuidv4();
    this.stmts.insertBoat.run(id, name, description);
    return this.stmts.getBoat.get(id);
  }

  updateBoat(id, name, description) {
    this.stmts.updateBoat.run(name, description, id);
    return this.stmts.getBoat.get(id);
  }

  deleteBoat(id) {
    this.stmts.deleteBoat.run(id);
  }

  getBoat(id) {
    return this.stmts.getBoat.get(id);
  }

  listBoats() {
    return this.stmts.listBoats.all();
  }

  // === Feeds ===
  createFeed(boatId, platform, name, icalUrl) {
    const id = uuidv4();
    this.stmts.insertFeed.run(id, boatId, platform, name, icalUrl);
    return this.stmts.getFeed.get(id);
  }

  updateFeed(id, platform, name, icalUrl) {
    this.stmts.updateFeed.run(platform, name, icalUrl, id);
    return this.stmts.getFeed.get(id);
  }

  deleteFeed(id) {
    this.stmts.deleteEventsByFeed.run(id);
    this.stmts.deleteFeed.run(id);
  }

  getFeed(id) {
    return this.stmts.getFeed.get(id);
  }

  listFeedsByBoat(boatId) {
    return this.stmts.listFeedsByBoat.all(boatId);
  }

  listAllFeeds() {
    return this.stmts.listAllFeeds.all();
  }

  updateFeedSyncStatus(id, status, error = null) {
    this.stmts.updateFeedSyncStatus.run(status, error, id);
  }

  // === Events ===
  replaceEventsForFeed(feedId, boatId, events) {
    const replace = this.db.transaction((evts) => {
      // Get old count
      const oldCount = this.stmts.countEventsByFeed.get(feedId).count;
      // Delete existing
      this.stmts.deleteEventsByFeed.run(feedId);
      // Insert new
      let added = 0;
      for (const evt of evts) {
        const id = uuidv4();
        this.stmts.insertEvent.run(
          id, feedId, boatId,
          evt.uid || null,
          evt.summary || 'Booking',
          evt.description || null,
          evt.location || null,
          evt.start_dt,
          evt.end_dt,
          evt.all_day ? 1 : 0,
          evt.raw_ical || null
        );
        added++;
      }
      return { found: evts.length, added, removed: oldCount };
    });
    return replace(events);
  }

  getEventsByBoat(boatId) {
    return this.stmts.getEventsByBoat.all(boatId);
  }

  getEventsByBoatInRange(boatId, start, end) {
    return this.stmts.getEventsByBoatInRange.all(boatId, start, end);
  }

  getEventsExcludingFeed(boatId, feedId) {
    return this.stmts.getEventsByFeedExcluded.all(boatId, feedId);
  }

  getAllEvents() {
    return this.stmts.getAllEvents.all();
  }

  // === Conflicts ===
  detectConflicts(boatId) {
    // Clear old unresolved conflicts for this boat
    this.stmts.deleteConflictsByBoat.run(boatId);

    // Get all events for this boat
    const events = this.stmts.getEventsByBoat.all(boatId);

    const conflicts = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];

        // Skip events from the same feed
        if (a.feed_id === b.feed_id) continue;

        // Check overlap
        const aStart = new Date(a.start_dt);
        const aEnd = new Date(a.end_dt);
        const bStart = new Date(b.start_dt);
        const bEnd = new Date(b.end_dt);

        if (aStart < bEnd && bStart < aEnd) {
          const overlapStart = new Date(Math.max(aStart, bStart)).toISOString();
          const overlapEnd = new Date(Math.min(aEnd, bEnd)).toISOString();

          const id = uuidv4();
          this.stmts.insertConflict.run(id, boatId, a.id, b.id, overlapStart, overlapEnd);
          conflicts.push({ id, event_a: a, event_b: b, overlapStart, overlapEnd });
        }
      }
    }

    return conflicts;
  }

  getUnresolvedConflicts(boatId) {
    return this.stmts.getUnresolvedConflicts.all(boatId);
  }

  getAllUnresolvedConflicts() {
    return this.stmts.getAllUnresolvedConflicts.all();
  }

  resolveConflict(id) {
    this.stmts.resolveConflict.run(id);
  }

  // === Sync Log ===
  startSyncLog(feedId) {
    const info = this.stmts.insertSyncLog.run(feedId);
    return info.lastInsertRowid;
  }

  finishSyncLog(id, status, stats = {}, error = null) {
    this.stmts.updateSyncLog.run(
      status,
      stats.found || 0,
      stats.added || 0,
      stats.updated || 0,
      stats.removed || 0,
      error,
      id
    );
  }

  getRecentSyncLogs(limit = 50) {
    return this.stmts.getRecentSyncLogs.all(limit);
  }

  // === Dashboard Stats ===
  getStats() {
    const boats = this.db.prepare('SELECT COUNT(*) as count FROM boats').get().count;
    const feeds = this.db.prepare('SELECT COUNT(*) as count FROM feeds').get().count;
    const events = this.db.prepare('SELECT COUNT(*) as count FROM events').get().count;
    const conflicts = this.db.prepare('SELECT COUNT(*) as count FROM conflicts WHERE resolved = 0').get().count;
    const lastSync = this.db.prepare('SELECT MAX(finished_at) as last FROM sync_log WHERE status = ?').get('success');
    return { boats, feeds, events, unresolvedConflicts: conflicts, lastSync: lastSync?.last };
  }
}

module.exports = { BoatSyncDB };
