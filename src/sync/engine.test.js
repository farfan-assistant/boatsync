const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { getDb } = require('../db/schema');
const { BoatSyncDB } = require('../db/queries');
const { parseIcalString } = require('./fetcher');
const { generateBlockingFeed, generateUnifiedFeed } = require('./generator');

describe('BoatSync Core', () => {
  let db, store;

  before(() => {
    process.env.DATA_DIR = '/tmp/boatsync-test-' + Date.now();
    db = getDb();
    store = new BoatSyncDB(db);
  });

  after(() => {
    db.close();
  });

  describe('Database', () => {
    it('should create and list boats', () => {
      const boat = store.createBoat('Test Yacht', 'A fine vessel');
      assert.ok(boat.id);
      assert.strictEqual(boat.name, 'Test Yacht');

      const boats = store.listBoats();
      assert.ok(boats.length >= 1);
    });

    it('should create and list feeds', () => {
      const boat = store.createBoat('Feed Test Boat', '');
      const feed = store.createFeed(boat.id, 'getmyboat', 'GMB Feed', 'https://example.com/cal.ics');
      assert.ok(feed.id);
      assert.strictEqual(feed.platform, 'getmyboat');

      const feeds = store.listFeedsByBoat(boat.id);
      assert.strictEqual(feeds.length, 1);
    });

    it('should store and retrieve events', () => {
      const boat = store.createBoat('Event Test Boat', '');
      const feed = store.createFeed(boat.id, 'boatsetter', 'BS Feed', 'https://example.com/bs.ics');

      const events = [
        { uid: 'e1', summary: 'Trip 1', start_dt: '2026-03-01T10:00:00Z', end_dt: '2026-03-03T16:00:00Z', all_day: false },
        { uid: 'e2', summary: 'Trip 2', start_dt: '2026-03-10T08:00:00Z', end_dt: '2026-03-10T18:00:00Z', all_day: false },
      ];

      const stats = store.replaceEventsForFeed(feed.id, boat.id, events);
      assert.strictEqual(stats.added, 2);

      const stored = store.getEventsByBoat(boat.id);
      assert.strictEqual(stored.length, 2);
    });

    it('should get dashboard stats', () => {
      const stats = store.getStats();
      assert.ok(typeof stats.boats === 'number');
      assert.ok(typeof stats.feeds === 'number');
      assert.ok(typeof stats.events === 'number');
      assert.ok(typeof stats.unresolvedConflicts === 'number');
    });
  });

  describe('Conflict Detection', () => {
    it('should detect overlapping bookings from different feeds', () => {
      const boat = store.createBoat('Conflict Boat', '');
      const feedA = store.createFeed(boat.id, 'getmyboat', 'GMB', 'https://a.com/a.ics');
      const feedB = store.createFeed(boat.id, 'boatsetter', 'BS', 'https://b.com/b.ics');

      // Feed A: booking Mar 5-7
      store.replaceEventsForFeed(feedA.id, boat.id, [
        { uid: 'a1', summary: 'GMB Booking', start_dt: '2026-03-05T10:00:00Z', end_dt: '2026-03-07T16:00:00Z', all_day: false },
      ]);

      // Feed B: booking Mar 6-8 (overlaps with A!)
      store.replaceEventsForFeed(feedB.id, boat.id, [
        { uid: 'b1', summary: 'BS Booking', start_dt: '2026-03-06T08:00:00Z', end_dt: '2026-03-08T18:00:00Z', all_day: false },
      ]);

      const conflicts = store.detectConflicts(boat.id);
      assert.strictEqual(conflicts.length, 1, 'Should detect exactly one conflict');
      assert.strictEqual(conflicts[0].event_a.summary, 'GMB Booking');
      assert.strictEqual(conflicts[0].event_b.summary, 'BS Booking');
    });

    it('should not flag events from the same feed as conflicts', () => {
      const boat = store.createBoat('Same Feed Boat', '');
      const feed = store.createFeed(boat.id, 'getmyboat', 'GMB', 'https://a.com/a.ics');

      store.replaceEventsForFeed(feed.id, boat.id, [
        { uid: 'a1', summary: 'Trip 1', start_dt: '2026-03-05T10:00:00Z', end_dt: '2026-03-07T16:00:00Z', all_day: false },
        { uid: 'a2', summary: 'Trip 2', start_dt: '2026-03-06T10:00:00Z', end_dt: '2026-03-08T16:00:00Z', all_day: false },
      ]);

      const conflicts = store.detectConflicts(boat.id);
      assert.strictEqual(conflicts.length, 0, 'Same-feed events should not conflict');
    });

    it('should not flag non-overlapping events as conflicts', () => {
      const boat = store.createBoat('No Conflict Boat', '');
      const feedA = store.createFeed(boat.id, 'getmyboat', 'GMB', 'https://a.com/a.ics');
      const feedB = store.createFeed(boat.id, 'boatsetter', 'BS', 'https://b.com/b.ics');

      store.replaceEventsForFeed(feedA.id, boat.id, [
        { uid: 'a1', summary: 'Trip A', start_dt: '2026-03-01T10:00:00Z', end_dt: '2026-03-03T16:00:00Z', all_day: false },
      ]);

      store.replaceEventsForFeed(feedB.id, boat.id, [
        { uid: 'b1', summary: 'Trip B', start_dt: '2026-03-05T08:00:00Z', end_dt: '2026-03-07T18:00:00Z', all_day: false },
      ]);

      const conflicts = store.detectConflicts(boat.id);
      assert.strictEqual(conflicts.length, 0, 'Non-overlapping events should not conflict');
    });
  });

  describe('iCal Parsing', () => {
    it('should parse VCALENDAR with events', () => {
      const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:test-001@example
DTSTART:20260301T100000Z
DTEND:20260303T160000Z
SUMMARY:Fishing Charter
END:VEVENT
END:VCALENDAR`;

      const events = parseIcalString(ical);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].summary, 'Fishing Charter');
      assert.strictEqual(events[0].uid, 'test-001@example');
    });

    it('should handle events without summary', () => {
      const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:nosummary@test
DTSTART:20260401T080000Z
DTEND:20260401T180000Z
END:VEVENT
END:VCALENDAR`;

      const events = parseIcalString(ical);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].summary, 'Booking');
    });
  });

  describe('iCal Generation', () => {
    it('should generate blocking feed with BLOCKED prefix', () => {
      const events = [
        { summary: 'Booked Trip', start_dt: '2026-03-05T10:00:00Z', end_dt: '2026-03-07T16:00:00Z', all_day: 0, platform: 'boatsetter', feed_name: 'BS' },
      ];
      const ical = generateBlockingFeed('Sea Breeze', 'GMB Feed', 'getmyboat', events);
      assert.ok(ical.includes('BEGIN:VCALENDAR'));
      assert.ok(ical.includes('[BLOCKED]'));
      assert.ok(ical.includes('Booked Trip'));
    });

    it('should generate unified feed with platform labels', () => {
      const events = [
        { summary: 'Trip A', start_dt: '2026-03-05T10:00:00Z', end_dt: '2026-03-07T16:00:00Z', all_day: 0, platform: 'getmyboat', feed_name: 'GMB' },
        { summary: 'Trip B', start_dt: '2026-03-10T10:00:00Z', end_dt: '2026-03-12T16:00:00Z', all_day: 0, platform: 'boatsetter', feed_name: 'BS' },
      ];
      const ical = generateUnifiedFeed('Sea Breeze', events);
      assert.ok(ical.includes('[getmyboat]'));
      assert.ok(ical.includes('[boatsetter]'));
    });
  });
});
