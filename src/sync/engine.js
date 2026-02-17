const { fetchIcalFeed } = require('./fetcher');

/**
 * Sync engine — orchestrates fetching, storing, and conflict detection.
 */
class SyncEngine {
  constructor(db) {
    this.db = db;
    this.syncInterval = null;
  }

  /**
   * Sync a single feed: fetch iCal, store events, detect conflicts.
   */
  async syncFeed(feedId) {
    const feed = this.db.getFeed(feedId);
    if (!feed) throw new Error(`Feed not found: ${feedId}`);

    const logId = this.db.startSyncLog(feedId);

    try {
      this.db.updateFeedSyncStatus(feedId, 'syncing');

      // Fetch and parse iCal
      const events = await fetchIcalFeed(feed.ical_url);

      // Replace events in DB
      const stats = this.db.replaceEventsForFeed(feedId, feed.boat_id, events);

      // Detect conflicts for this boat
      const conflicts = this.db.detectConflicts(feed.boat_id);

      // Update status
      this.db.updateFeedSyncStatus(feedId, 'success');
      this.db.finishSyncLog(logId, 'success', stats);

      return {
        feed: feed.name,
        platform: feed.platform,
        events: stats.found,
        added: stats.added,
        removed: stats.removed,
        conflicts: conflicts.length,
      };
    } catch (err) {
      this.db.updateFeedSyncStatus(feedId, 'error', err.message);
      this.db.finishSyncLog(logId, 'error', {}, err.message);
      throw err;
    }
  }

  /**
   * Sync all feeds for a boat.
   */
  async syncBoat(boatId) {
    const feeds = this.db.listFeedsByBoat(boatId);
    const results = [];
    const errors = [];

    for (const feed of feeds) {
      try {
        const result = await this.syncFeed(feed.id);
        results.push(result);
      } catch (err) {
        errors.push({ feed: feed.name, platform: feed.platform, error: err.message });
      }
    }

    return { results, errors };
  }

  /**
   * Sync all feeds across all boats.
   */
  async syncAll() {
    const feeds = this.db.listAllFeeds();
    const results = [];
    const errors = [];

    for (const feed of feeds) {
      try {
        const result = await this.syncFeed(feed.id);
        results.push(result);
      } catch (err) {
        errors.push({ feed: feed.name, platform: feed.platform, error: err.message });
      }
    }

    return { results, errors, timestamp: new Date().toISOString() };
  }

  /**
   * Start periodic sync.
   */
  startPeriodicSync(intervalMinutes = 15) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    console.log(`[SyncEngine] Starting periodic sync every ${intervalMinutes} minutes`);

    // Run immediately
    this.syncAll().then(r => {
      console.log(`[SyncEngine] Initial sync complete: ${r.results.length} feeds synced, ${r.errors.length} errors`);
    }).catch(err => {
      console.error(`[SyncEngine] Initial sync error:`, err.message);
    });

    this.syncInterval = setInterval(async () => {
      try {
        const r = await this.syncAll();
        console.log(`[SyncEngine] Periodic sync: ${r.results.length} feeds, ${r.errors.length} errors`);
      } catch (err) {
        console.error(`[SyncEngine] Periodic sync error:`, err.message);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic sync.
   */
  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[SyncEngine] Periodic sync stopped');
    }
  }
}

module.exports = { SyncEngine };
