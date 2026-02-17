const express = require('express');
const path = require('path');
const { getDb } = require('./db/schema');
const { BoatSyncDB } = require('./db/queries');
const { SyncEngine } = require('./sync/engine');
const { generateBlockingFeed, generateUnifiedFeed } = require('./sync/generator');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10);

// Initialize
const db = getDb();
const store = new BoatSyncDB(db);
const engine = new SyncEngine(store);
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

// ============ API Routes ============

// --- Dashboard ---
app.get('/api/stats', (req, res) => {
  res.json(store.getStats());
});

// --- Boats ---
app.get('/api/boats', (req, res) => {
  const boats = store.listBoats();
  // Enrich with feed count and event count
  const enriched = boats.map(b => {
    const feeds = store.listFeedsByBoat(b.id);
    const events = store.getEventsByBoat(b.id);
    const conflicts = store.getUnresolvedConflicts(b.id);
    return { ...b, feedCount: feeds.length, eventCount: events.length, conflictCount: conflicts.length };
  });
  res.json(enriched);
});

app.post('/api/boats', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const boat = store.createBoat(name, description || '');
  res.status(201).json(boat);
});

app.put('/api/boats/:id', (req, res) => {
  const { name, description } = req.body;
  const boat = store.updateBoat(req.params.id, name, description);
  if (!boat) return res.status(404).json({ error: 'Boat not found' });
  res.json(boat);
});

app.delete('/api/boats/:id', (req, res) => {
  store.deleteBoat(req.params.id);
  res.json({ ok: true });
});

// --- Feeds ---
app.get('/api/boats/:boatId/feeds', (req, res) => {
  const feeds = store.listFeedsByBoat(req.params.boatId);
  res.json(feeds);
});

app.post('/api/boats/:boatId/feeds', (req, res) => {
  const { platform, name, ical_url } = req.body;
  if (!platform || !name || !ical_url) {
    return res.status(400).json({ error: 'platform, name, and ical_url are required' });
  }
  const feed = store.createFeed(req.params.boatId, platform, name, ical_url);
  res.status(201).json(feed);
});

app.put('/api/feeds/:id', (req, res) => {
  const { platform, name, ical_url } = req.body;
  const feed = store.updateFeed(req.params.id, platform, name, ical_url);
  if (!feed) return res.status(404).json({ error: 'Feed not found' });
  res.json(feed);
});

app.delete('/api/feeds/:id', (req, res) => {
  store.deleteFeed(req.params.id);
  res.json({ ok: true });
});

// --- Sync ---
app.post('/api/sync/feed/:feedId', async (req, res) => {
  try {
    const result = await engine.syncFeed(req.params.feedId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/boat/:boatId', async (req, res) => {
  try {
    const result = await engine.syncBoat(req.params.boatId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/all', async (req, res) => {
  try {
    const result = await engine.syncAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sync/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  res.json(store.getRecentSyncLogs(limit));
});

// --- Events ---
app.get('/api/boats/:boatId/events', (req, res) => {
  const { start, end } = req.query;
  let events;
  if (start && end) {
    events = store.getEventsByBoatInRange(req.params.boatId, start, end);
  } else {
    events = store.getEventsByBoat(req.params.boatId);
  }
  res.json(events);
});

// --- Conflicts ---
app.get('/api/conflicts', (req, res) => {
  res.json(store.getAllUnresolvedConflicts());
});

app.get('/api/boats/:boatId/conflicts', (req, res) => {
  res.json(store.getUnresolvedConflicts(req.params.boatId));
});

app.post('/api/conflicts/:id/resolve', (req, res) => {
  store.resolveConflict(req.params.id);
  res.json({ ok: true });
});

// --- iCal Feed Endpoints ---

// Blocking feed for a specific feed (contains events from all OTHER feeds for the same boat)
app.get('/api/ical/blocking/:feedId.ics', (req, res) => {
  const feed = store.getFeed(req.params.feedId);
  if (!feed) return res.status(404).send('Feed not found');

  const boat = store.getBoat(feed.boat_id);
  if (!boat) return res.status(404).send('Boat not found');

  const events = store.getEventsExcludingFeed(feed.boat_id, feed.id);
  const ical = generateBlockingFeed(boat.name, feed.name, feed.platform, events);

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="boatsync-block-${feed.platform}.ics"`);
  res.send(ical);
});

// Unified feed for a boat (all events from all platforms)
app.get('/api/ical/unified/:boatId.ics', (req, res) => {
  const boat = store.getBoat(req.params.boatId);
  if (!boat) return res.status(404).send('Boat not found');

  const events = store.getEventsByBoat(req.params.boatId);
  const ical = generateUnifiedFeed(boat.name, events);

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="boatsync-unified-${boat.name}.ics"`);
  res.send(ical);
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// ============ Start ============
app.listen(PORT, HOST, () => {
  console.log(`
  ⚓ BoatSync running on http://${HOST}:${PORT}
  📅 Sync interval: every ${SYNC_INTERVAL} minutes
  `);

  // Start periodic sync
  engine.startPeriodicSync(SYNC_INTERVAL);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  engine.stopPeriodicSync();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  engine.stopPeriodicSync();
  db.close();
  process.exit(0);
});
