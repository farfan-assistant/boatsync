const icalGenerator = require('ical-generator');

/**
 * Generate a blocking iCal feed for a specific platform/feed.
 * Contains all events from OTHER feeds for the same boat,
 * so the platform can block those dates.
 */
function generateBlockingFeed(boatName, feedName, platform, events) {
  const cal = icalGenerator.default({
    name: `BoatSync — ${boatName} (Block for ${platform})`,
    description: `Blocking calendar for ${boatName} on ${platform}. These dates are booked on other platforms.`,
    prodId: { company: 'BoatSync', product: 'Calendar Sync', language: 'EN' },
    timezone: 'UTC',
  });

  for (const event of events) {
    const startDate = new Date(event.start_dt);
    const endDate = new Date(event.end_dt);

    cal.createEvent({
      start: startDate,
      end: endDate,
      summary: `[BLOCKED] ${event.summary || 'Booking'} (via ${event.platform || 'other platform'})`,
      description: `This slot is booked on ${event.platform || 'another platform'} (${event.feed_name || 'external feed'}). Blocked by BoatSync to prevent double booking.`,
      allDay: event.all_day === 1,
      status: 'CONFIRMED',
      busystatus: 'BUSY',
      transparency: 'OPAQUE',
    });
  }

  return cal.toString();
}

/**
 * Generate a unified calendar feed for a boat.
 * Contains ALL events from all platforms.
 */
function generateUnifiedFeed(boatName, events) {
  const cal = icalGenerator.default({
    name: `BoatSync — ${boatName} (All Bookings)`,
    description: `Unified calendar for ${boatName} — all bookings from all platforms.`,
    prodId: { company: 'BoatSync', product: 'Calendar Sync', language: 'EN' },
    timezone: 'UTC',
  });

  for (const event of events) {
    const startDate = new Date(event.start_dt);
    const endDate = new Date(event.end_dt);

    cal.createEvent({
      start: startDate,
      end: endDate,
      summary: `${event.summary || 'Booking'} [${event.platform || 'unknown'}]`,
      description: `Source: ${event.platform || 'unknown'} (${event.feed_name || ''})`,
      allDay: event.all_day === 1,
      status: 'CONFIRMED',
      busystatus: 'BUSY',
      transparency: 'OPAQUE',
    });
  }

  return cal.toString();
}

module.exports = { generateBlockingFeed, generateUnifiedFeed };
