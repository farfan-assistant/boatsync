# BoatSync — Calendar Sync for Charter Boats

**Stop double bookings. Sync your charter boat calendar across every platform.**

Charter boat operators list on multiple platforms (GetMyBoat, Boatsetter, FishingBooker, SamBoat, etc.) but these platforms don't sync calendars with each other. One booking on GetMyBoat doesn't block the same slot on Boatsetter — leading to double bookings, angry customers, and lost revenue.

**BoatSync fixes this.**

## How It Works

1. **Add your iCal feed URLs** from each booking platform (most platforms export these)
2. **BoatSync aggregates** all bookings into one unified calendar
3. **Import BoatSync's blocking feed** back into each platform — it blocks dates that are booked elsewhere
4. **Get alerts** when conflicts are detected

```
GetMyBoat  ──iCal──→  ┌──────────┐  ──blocking feed──→  Boatsetter
Boatsetter ──iCal──→  │ BoatSync │  ──blocking feed──→  GetMyBoat
FishingBooker─iCal──→ │          │  ──blocking feed──→  FishingBooker
Your Website─iCal──→  └──────────┘  ──blocking feed──→  Your Website
```

## Features

- 📅 **Unified Calendar** — See all bookings from all platforms in one view
- 🔄 **Auto-Sync** — Polls iCal feeds every 15 minutes (configurable)
- 🚨 **Conflict Detection** — Alerts when overlapping bookings are found
- 📤 **Blocking Feeds** — Per-platform iCal feeds that block dates booked elsewhere
- 🚢 **Multi-Boat Support** — Manage multiple vessels from one dashboard
- 🌐 **Web Dashboard** — Clean, mobile-friendly interface
- 🔑 **No API Keys Needed** — Works with standard iCal feeds (supported by most platforms)

## Supported Platforms

Any platform that exports iCal feeds, including:
- GetMyBoat
- Boatsetter
- FishingBooker
- SamBoat
- Bookalet
- FareHarbor
- Google Calendar
- Outlook/Office 365
- Any custom website with iCal export

## Quick Start

```bash
# Clone and install
git clone https://github.com/farfan-assistant/boatsync.git
cd boatsync
npm install

# Configure
cp .env.example .env
# Edit .env with your settings

# Run
npm start
# Dashboard: http://localhost:3000
```

## Tech Stack

- **Runtime:** Node.js
- **Server:** Express
- **Database:** SQLite (via better-sqlite3)
- **iCal Parsing:** node-ical
- **iCal Generation:** ical-generator
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Zero external services required** — runs entirely on your machine or server

## Revenue Model

- **Free tier:** 1 boat, 2 platforms
- **Pro:** Unlimited boats & platforms, priority sync, email alerts — $29/mo
- **Business:** Team access, API, webhooks, white-label — $79/mo

## Architecture

```
src/
  server.js          — Express server & API routes
  sync/
    fetcher.js       — iCal feed polling & parsing
    merger.js        — Event aggregation & conflict detection
    generator.js     — Blocking feed generation
  db/
    schema.js        — SQLite schema & migrations
    queries.js       — Database operations
  web/
    index.html       — Dashboard SPA
    app.js           — Frontend logic
    styles.css        — Styles
```

## License

MIT

---

*Built by Hephaestus — the forge that turns ideas into working software.*
