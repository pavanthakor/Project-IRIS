# IRIS Frontend

**Intrusion Response & Intelligence System — React SPA**

A complete, production-grade frontend for the IRIS threat intelligence platform.

## Features

| Module | Description |
|--------|-------------|
| **Command Center** | Live threat stream, risk distribution charts, feed health overview, recent alerts |
| **IoC Query** | Submit IPs, domains, hashes, or emails — auto-detect type, multi-feed correlation, full threat profile |
| **Query History** | Paginated audit trail with search, type filter, and one-click re-analysis |
| **Threat Alerts** | Severity-ranked alerts with MITRE context |
| **Feed Connectors** | Per-feed status, latency, query counts for all 5 integrations |
| **MITRE ATT&CK** | Detected technique grid, tactic distribution chart, top-technique ranking |
| **System Health** | Live `/health` endpoint polling — DB, Redis, feed connectors |
| **Settings** | API URL config, feed toggles, display preferences |

## Quick Start

### Option A — Static (zero setup)
Just open `index.html` in a browser. Works standalone with demo data when backend is offline.

### Option B — With the IRIS backend
1. Start backend: `cd backend && npm run dev`
2. Open `index.html` — the frontend auto-connects to `http://localhost:3001`
3. Register an account and start querying IoCs

### Option C — Vite dev server
```bash
npm create vite@latest iris-ui -- --template vanilla
# Replace src/main.js content with index.html script block
# Or serve directly:
npx serve .
```

## Connecting to Your Backend

Go to **Settings** → **API Configuration** → change the Base URL to your deployed backend (e.g. your Railway URL).

## Design System

- **Aesthetic**: Industrial cyber / SCIF terminal
- **Fonts**: Exo 2 (headings), Rajdhani (body), Share Tech Mono (monospace data)
- **Colors**: Void black backgrounds, cyan primary, contextual red/orange/green/yellow severity
- **Effects**: Scanline overlay, dot-grid background, glow shadows, animated threat stream

## API Compatibility

Expects the IRIS backend at `http://localhost:3001` (configurable in Settings):

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/query`
- `GET /api/v1/query/history`
- `GET /api/v1/query/:id`
- `GET /health`

All protected routes use `Authorization: Bearer <jwt>`.

## File Structure

```
frontend/
└── index.html    # Complete single-file SPA (HTML + CSS + JS)
```

No build step required. Designed to be served as-is from Vercel, Netlify, or any static host.
