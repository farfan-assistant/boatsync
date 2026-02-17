// BoatSync Dashboard — Frontend Logic

const API = '';
let state = {
  boats: [],
  selectedBoat: null,
  events: [],
  feeds: [],
  conflicts: [],
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  activeTab: 'calendar',
};

// ============ API Calls ============

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ============ Data Loading ============

async function loadStats() {
  const stats = await api('/api/stats');
  document.getElementById('stat-boats').textContent = stats.boats;
  document.getElementById('stat-feeds').textContent = stats.feeds;
  document.getElementById('stat-events').textContent = stats.events;
  document.getElementById('stat-conflicts').textContent = stats.unresolvedConflicts;
  const card = document.getElementById('stat-conflicts-card');
  if (stats.unresolvedConflicts > 0) {
    card.classList.add('alert');
  } else {
    card.classList.remove('alert');
    card.querySelector('.stat-value').style.color = 'var(--teal-light)';
  }
}

async function loadBoats() {
  state.boats = await api('/api/boats');
  renderBoatList();
}

async function loadBoatData(boatId) {
  state.selectedBoat = boatId;
  const [events, feeds, conflicts] = await Promise.all([
    api(`/api/boats/${boatId}/events`),
    api(`/api/boats/${boatId}/feeds`),
    api(`/api/boats/${boatId}/conflicts`),
  ]);
  state.events = events;
  state.feeds = feeds;
  state.conflicts = conflicts;
  renderAll();
}

async function loadAllConflicts() {
  const conflicts = await api('/api/conflicts');
  state.allConflicts = conflicts;
  renderConflictsPanel();
}

async function loadSyncLogs() {
  const logs = await api('/api/sync/logs?limit=30');
  renderSyncLog(logs);
}

// ============ Actions ============

async function addBoat() {
  const name = document.getElementById('boat-name').value.trim();
  const description = document.getElementById('boat-description').value.trim();
  if (!name) return toast('Please enter a boat name', true);
  await api('/api/boats', { method: 'POST', body: { name, description } });
  closeModal('modal-add-boat');
  document.getElementById('boat-name').value = '';
  document.getElementById('boat-description').value = '';
  await loadBoats();
  await loadStats();
  toast('Boat added!');
}

async function deleteBoat(id) {
  if (!confirm('Delete this boat and all its feeds/events?')) return;
  await api(`/api/boats/${id}`, { method: 'DELETE' });
  if (state.selectedBoat === id) state.selectedBoat = null;
  await loadBoats();
  await loadStats();
  toast('Boat deleted');
}

async function addFeed() {
  if (!state.selectedBoat) return toast('Select a boat first', true);
  const platform = document.getElementById('feed-platform').value;
  const name = document.getElementById('feed-name').value.trim();
  const ical_url = document.getElementById('feed-url').value.trim();
  if (!name || !ical_url) return toast('Name and URL are required', true);
  await api(`/api/boats/${state.selectedBoat}/feeds`, { method: 'POST', body: { platform, name, ical_url } });
  closeModal('modal-add-feed');
  document.getElementById('feed-name').value = '';
  document.getElementById('feed-url').value = '';
  await loadBoatData(state.selectedBoat);
  await loadStats();
  toast('Feed added! Syncing...');
  // Trigger sync
  const feeds = await api(`/api/boats/${state.selectedBoat}/feeds`);
  const newFeed = feeds[feeds.length - 1];
  if (newFeed) {
    try {
      await api(`/api/sync/feed/${newFeed.id}`, { method: 'POST' });
      await loadBoatData(state.selectedBoat);
      await loadStats();
      toast('Feed synced!');
    } catch (e) {
      toast(`Sync error: ${e.message}`, true);
    }
  }
}

async function deleteFeed(id) {
  if (!confirm('Delete this feed and its events?')) return;
  await api(`/api/feeds/${id}`, { method: 'DELETE' });
  await loadBoatData(state.selectedBoat);
  await loadStats();
  toast('Feed deleted');
}

async function syncFeed(feedId) {
  try {
    toast('Syncing...');
    await api(`/api/sync/feed/${feedId}`, { method: 'POST' });
    await loadBoatData(state.selectedBoat);
    await loadStats();
    toast('Sync complete!');
  } catch (e) {
    toast(`Sync error: ${e.message}`, true);
  }
}

async function syncAll() {
  try {
    toast('Syncing all feeds...');
    const result = await api('/api/sync/all', { method: 'POST' });
    await loadStats();
    if (state.selectedBoat) await loadBoatData(state.selectedBoat);
    toast(`Synced ${result.results.length} feeds, ${result.errors.length} errors`);
  } catch (e) {
    toast(`Sync error: ${e.message}`, true);
  }
}

async function resolveConflict(id) {
  await api(`/api/conflicts/${id}/resolve`, { method: 'POST' });
  if (state.selectedBoat) await loadBoatData(state.selectedBoat);
  await loadAllConflicts();
  await loadStats();
  toast('Conflict resolved');
}

// ============ Rendering ============

function renderBoatList() {
  const el = document.getElementById('boat-list');
  if (state.boats.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🚢</div><h3>No boats yet</h3><p>Add your first charter boat to get started.</p><button class="btn btn-primary" onclick="showAddBoat()">+ Add Boat</button></div>`;
    return;
  }
  el.innerHTML = state.boats.map(b => `
    <div class="boat-item ${state.selectedBoat === b.id ? 'active' : ''}" onclick="selectBoat('${b.id}')">
      <div class="boat-icon">⛵</div>
      <div class="boat-info">
        <div class="boat-name">${esc(b.name)}</div>
        <div class="boat-meta">${b.feedCount} feed${b.feedCount !== 1 ? 's' : ''} · ${b.eventCount} event${b.eventCount !== 1 ? 's' : ''}</div>
      </div>
      ${b.conflictCount > 0 ? `<span class="badge">${b.conflictCount}</span>` : `<span class="badge ok">✓</span>`}
    </div>
  `).join('');
}

function renderAll() {
  renderBoatList();
  renderCalendar();
  renderEvents();
  renderFeeds();
  renderConflictsPanel();
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const year = state.currentYear;
  const month = state.currentMonth;

  document.getElementById('month-label').textContent =
    new Date(year, month).toLocaleString('en', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const today = new Date();

  // Build event map: day -> events
  const eventMap = {};
  for (const evt of state.events) {
    const start = new Date(evt.start_dt);
    const end = new Date(evt.end_dt);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === month && d.getFullYear() === year) {
        const key = d.getDate();
        if (!eventMap[key]) eventMap[key] = [];
        eventMap[key].push(evt);
      }
    }
  }

  // Conflict days
  const conflictDays = new Set();
  for (const c of state.conflicts) {
    const start = new Date(c.overlap_start || c.event_a_start);
    const end = new Date(c.overlap_end || c.event_a_end);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getMonth() === month && d.getFullYear() === year) {
        conflictDays.add(d.getDate());
      }
    }
  }

  let html = '';
  // Headers
  for (const day of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    html += `<div class="cal-header">${day}</div>`;
  }

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month"><span class="day-num">${daysInPrev - i}</span></div>`;
  }

  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    const dayEvents = eventMap[d] || [];
    const hasConflict = conflictDays.has(d);

    let dots = '';
    const platforms = new Set(dayEvents.map(e => e.platform || 'other'));
    for (const p of platforms) {
      dots += `<span class="event-dot ${p}"></span>`;
    }
    if (hasConflict) dots += `<span class="event-dot conflict"></span>`;

    html += `<div class="cal-day ${isToday ? 'today' : ''}">
      <span class="day-num">${d}</span>
      <div>${dots}</div>
    </div>`;
  }

  // Next month padding
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="cal-day other-month"><span class="day-num">${i}</span></div>`;
  }

  grid.innerHTML = html;
}

function renderEvents() {
  const el = document.getElementById('events-list');
  if (state.events.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><h3>No events</h3><p>Connect iCal feeds to see bookings here.</p></div>`;
    return;
  }

  // Sort by start date, upcoming first
  const now = new Date();
  const upcoming = state.events.filter(e => new Date(e.end_dt) >= now).sort((a, b) => new Date(a.start_dt) - new Date(b.start_dt));
  const past = state.events.filter(e => new Date(e.end_dt) < now).sort((a, b) => new Date(b.start_dt) - new Date(a.start_dt));

  let html = '';
  if (upcoming.length) {
    html += '<div style="font-size:0.8rem;color:var(--text-dim);padding:0.5rem 0;font-weight:600;">UPCOMING</div>';
    html += upcoming.map(e => renderEventItem(e)).join('');
  }
  if (past.length) {
    html += '<div style="font-size:0.8rem;color:var(--text-dim);padding:0.5rem 0;margin-top:0.5rem;font-weight:600;">PAST</div>';
    html += past.slice(0, 20).map(e => renderEventItem(e)).join('');
  }

  el.innerHTML = html;
}

function renderEventItem(e) {
  const start = new Date(e.start_dt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  const end = new Date(e.end_dt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  const dates = start === end ? start : `${start} → ${end}`;
  return `<div class="event-item">
    <div class="event-title">${esc(e.summary || 'Booking')}</div>
    <div class="event-dates">${dates}</div>
    <span class="event-platform">${esc(e.platform || 'unknown')}</span>
  </div>`;
}

function renderFeeds() {
  const el = document.getElementById('feeds-section');
  const btn = document.getElementById('add-feed-btn');

  if (!state.selectedBoat) {
    btn.hidden = true;
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><h3>No feeds connected</h3><p>Select a boat, then add iCal feed URLs from your booking platforms.</p></div>`;
    return;
  }

  btn.hidden = false;

  if (state.feeds.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔗</div><h3>No feeds yet</h3><p>Add iCal feed URLs from your booking platforms.</p><button class="btn btn-primary" onclick="showAddFeed()">+ Add Feed</button></div>`;
    return;
  }

  const baseUrl = window.location.origin;

  let html = state.feeds.map(f => `
    <div class="feed-item">
      <div class="feed-status ${f.sync_status}"></div>
      <div class="feed-info">
        <div class="feed-name">${esc(f.name)}</div>
        <div class="feed-meta">${esc(f.platform)} · ${f.last_synced_at ? 'Last synced: ' + new Date(f.last_synced_at).toLocaleString() : 'Not synced'}${f.last_error ? ' · Error: ' + esc(f.last_error) : ''}</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="syncFeed('${f.id}')">🔄</button>
      <button class="btn btn-danger btn-sm" onclick="deleteFeed('${f.id}')">✕</button>
    </div>
    <div class="feed-url-block">
      <span style="font-size:0.75rem;color:var(--text-dim);">Blocking feed:</span>
      <code>${baseUrl}/api/ical/blocking/${f.id}.ics</code>
      <button class="btn btn-secondary btn-sm" onclick="copyUrl('${baseUrl}/api/ical/blocking/${f.id}.ics')">📋</button>
    </div>
  `).join('');

  // Unified feed URL
  html += `<div style="margin-top:1rem;padding-top:0.8rem;border-top:1px solid rgba(255,255,255,0.06);">
    <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.4rem;">📅 Unified Calendar Feed</div>
    <div class="feed-url-block">
      <code>${baseUrl}/api/ical/unified/${state.selectedBoat}.ics</code>
      <button class="btn btn-secondary btn-sm" onclick="copyUrl('${baseUrl}/api/ical/unified/${state.selectedBoat}.ics')">📋</button>
    </div>
  </div>`;

  el.innerHTML = html;
}

function renderConflictsPanel() {
  const panel = document.getElementById('conflicts-panel');
  const el = document.getElementById('conflicts-list');
  const conflicts = state.conflicts || [];

  if (conflicts.length === 0) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  el.innerHTML = conflicts.map(c => `
    <div class="conflict-alert">
      <div class="conflict-title">⚠️ Double Booking Detected</div>
      <div style="font-size:0.82rem;">
        <strong>${esc(c.event_a_summary)}</strong> on ${esc(c.event_a_platform)}<br>
        ${fmtDate(c.event_a_start)} → ${fmtDate(c.event_a_end)}<br><br>
        <strong>${esc(c.event_b_summary)}</strong> on ${esc(c.event_b_platform)}<br>
        ${fmtDate(c.event_b_start)} → ${fmtDate(c.event_b_end)}
      </div>
      <div style="margin-top:0.6rem;">
        <button class="btn btn-secondary btn-sm" onclick="resolveConflict('${c.id}')">✓ Mark Resolved</button>
      </div>
    </div>
  `).join('');
}

function renderSyncLog(logs) {
  const el = document.getElementById('sync-log-list');
  if (!logs || logs.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>No sync history</h3><p>Sync your feeds to see activity here.</p></div>`;
    return;
  }
  el.innerHTML = logs.map(l => `
    <div class="event-item" style="border-left-color: ${l.status === 'success' ? 'var(--teal)' : l.status === 'error' ? 'var(--coral)' : 'var(--gold)'};">
      <div class="event-title">${esc(l.feed_name)} (${esc(l.boat_name)})</div>
      <div class="event-dates">${new Date(l.started_at).toLocaleString()} · ${l.status}${l.error ? ' — ' + esc(l.error) : ''}</div>
      <span class="event-platform">${l.events_found} found · ${l.events_added} added · ${l.events_removed} removed</span>
    </div>
  `).join('');
}

// ============ Navigation ============

function selectBoat(id) {
  loadBoatData(id);
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.hidden = t.id !== `tab-${tab}`);
  if (tab === 'sync-log') loadSyncLogs();
}

function prevMonth() {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  renderCalendar();
}

function nextMonth() {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  renderCalendar();
}

function goToday() {
  const now = new Date();
  state.currentMonth = now.getMonth();
  state.currentYear = now.getFullYear();
  renderCalendar();
}

// ============ Modals ============

function showAddBoat() { openModal('modal-add-boat'); document.getElementById('boat-name').focus(); }
function showAddFeed() { openModal('modal-add-feed'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ============ Utilities ============

function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(dt) {
  return new Date(dt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

function copyUrl(url) {
  navigator.clipboard.writeText(url).then(() => toast('URL copied!')).catch(() => toast('Copy failed', true));
}

function toast(msg, error = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.className = 'toast', 3000);
}

// ============ Init ============

async function init() {
  await loadStats();
  await loadBoats();
  await loadAllConflicts();
  renderCalendar();

  // Auto-select first boat if any
  if (state.boats.length > 0 && !state.selectedBoat) {
    selectBoat(state.boats[0].id);
  }
}

init();
