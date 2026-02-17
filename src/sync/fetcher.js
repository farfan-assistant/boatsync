const ical = require('node-ical');

/**
 * Fetch and parse an iCal feed from a URL.
 * Returns normalized event objects.
 */
async function fetchIcalFeed(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const events = await ical.async.fromURL(url);
    clearTimeout(timeout);
    return parseIcalEvents(events);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Failed to fetch iCal feed: ${err.message}`);
  }
}

/**
 * Parse iCal data from a string.
 */
function parseIcalString(data) {
  const events = ical.sync.parseICS(data);
  return parseIcalEvents(events);
}

/**
 * Normalize parsed iCal events into our internal format.
 */
function parseIcalEvents(icalData) {
  const events = [];

  for (const [key, component] of Object.entries(icalData)) {
    if (component.type !== 'VEVENT') continue;

    const startDt = component.start;
    const endDt = component.end || component.start;

    if (!startDt) continue;

    // Determine if it's an all-day event
    const allDay = component.datetype === 'date' ||
      (startDt.dateOnly === true) ||
      (typeof component.start === 'string' && component.start.length <= 10);

    const event = {
      uid: component.uid || key,
      summary: component.summary || 'Booking',
      description: component.description || '',
      location: component.location || '',
      start_dt: normalizeDate(startDt),
      end_dt: normalizeDate(endDt),
      all_day: allDay,
      raw_ical: null, // Could store raw VEVENT here if needed
    };

    // Skip events in the far past (more than 6 months ago)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (new Date(event.end_dt) < sixMonthsAgo) continue;

    events.push(event);
  }

  return events;
}

/**
 * Normalize a date value to ISO string.
 */
function normalizeDate(dt) {
  if (dt instanceof Date) return dt.toISOString();
  if (typeof dt === 'string') return new Date(dt).toISOString();
  if (dt && dt.toISOString) return dt.toISOString();
  return new Date(dt).toISOString();
}

module.exports = { fetchIcalFeed, parseIcalString, parseIcalEvents };
