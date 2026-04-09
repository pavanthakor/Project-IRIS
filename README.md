# Threat Intelligence Aggregator & Correlation Platform

The Threat Intelligence Aggregator & Correlation Platform ingests Indicators of Compromise (IoCs) such as IPs, domains, hashes, and emails, queries multiple external threat-intel feeds in parallel, and returns a single correlated threat profile. The backend computes a normalized risk score, maps relevant MITRE ATT&CK techniques, and returns feed-level context so analysts can quickly move from raw signal to triage decision.

The platform is designed for reliability in real-world security workflows: JWT-protected APIs, request-level validation, Redis-backed caching, distributed circuit-breaker behavior for feed resiliency, and PostgreSQL-backed query history/auditability. It is backend-first today, with a React 18 SPA frontend planned in Phase 2.

## Architecture

```text
┌──────────────────────┐
│      React 18 SPA    │
│   (Phase 2 frontend) │
└──────────┬───────────┘
                │ HTTPS / JSON
                ▼
┌──────────────────────────────┐
│   Express API (TypeScript)   │
│      /health, /api/v1/*      │
└───────┬──────────┬───────────┘
            │          │
            │          ├─────────────────────────────┐
            │          │                             │
            ▼          ▼                             ▼
┌────────────────┐ ┌───────────────────┐ ┌──────────────────┐
│ Feed Connectors│ │   PostgreSQL      │ │      Redis       │
│ VT/AbuseIPDB/  │ │ users/query history│ │ cache/rate-limit │
│ Shodan/IPInfo/ │ │ and audit trail    │ │ circuit-breakers │
│ AbstractEmail  │ └───────────────────┘ └──────────────────┘
└────────────────┘
```

## Tech Stack

- Node.js (20+)
- Express
- TypeScript
- React 18 (frontend, Phase 2)
- PostgreSQL
- Redis

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- API keys for threat feeds:
   - VirusTotal
   - AbuseIPDB
   - Shodan
   - IPInfo
   - Abstract Email Validation

## Quick Start

1. Clone the repository:
    ```bash
    git clone <your-repo-url>
    ```
2. Enter the project:
    ```bash
    cd threat-intel-platform
    ```
3. Create local environment file and fill API keys:
    ```bash
    cp backend/.env.example backend/.env
    ```
4. Start infrastructure (PostgreSQL + Redis):
    ```bash
    docker compose up -d
    ```
5. Start backend API:
    ```bash
    cd backend
    npm install
    npm run dev
    ```
6. Test backend health:
    ```bash
    curl http://localhost:3001/health
    ```
7. Start frontend (Phase 2):
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## Environment Variables

All backend variables are defined in `backend/.env.example`.

| Variable | Description | Default | Required? |
|---|---|---|---|
| `PORT` | HTTP port used by backend API | `3001` | No |
| `NODE_ENV` | Runtime environment (`development`, `test`, `production`) | `development` | No |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/threat_intel` | Yes |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` | Yes |
| `JWT_SECRET` | Secret used to sign/verify JWT access tokens | `change-this-to-a-random-32-char-string-in-production` | Yes (production) |
| `CORS_ORIGIN` | Allowed browser origin for CORS | `http://localhost:5173` | No |
| `VIRUSTOTAL_API_KEY` | API key for VirusTotal feed | _(empty)_ | Yes (if feed enabled) |
| `ABUSEIPDB_API_KEY` | API key for AbuseIPDB feed | _(empty)_ | Yes (if feed enabled) |
| `SHODAN_API_KEY` | API key for Shodan feed | _(empty)_ | Yes (if feed enabled) |
| `IPINFO_API_KEY` | API key for IPInfo feed | _(empty)_ | Yes (if feed enabled) |
| `ABSTRACT_EMAIL_API_KEY` | API key for Abstract Email feed | _(empty)_ | Yes (if feed enabled) |
| `FEED_VIRUSTOTAL_ENABLED` | Enable/disable VirusTotal connector | `true` | No |
| `FEED_ABUSEIPDB_ENABLED` | Enable/disable AbuseIPDB connector | `true` | No |
| `FEED_SHODAN_ENABLED` | Enable/disable Shodan connector | `true` | No |
| `FEED_IPINFO_ENABLED` | Enable/disable IPInfo connector | `true` | No |
| `FEED_ABSTRACTEMAIL_ENABLED` | Enable/disable Abstract Email connector | `true` | No |
| `CACHE_ENABLED` | Enable/disable Redis result caching | `true` | No |
| `AUTH_REQUIRED` | Enable/disable auth guard for protected routes | `true` | No |

## API Endpoints

Base URL (local): `http://localhost:3001`

### Health

#### `GET /health`

Response example:

```json
{
   "status": "ok",
   "uptime": 123,
   "timestamp": "2026-04-09T12:00:00.000Z",
   "db": "connected",
   "redis": "connected",
   "feeds": {
      "VirusTotal": "healthy",
      "AbuseIPDB": "healthy",
      "Shodan": "healthy",
      "IPInfo": "healthy",
      "AbstractEmail": "healthy"
   },
   "version": "1.0.0"
}
```

### Authentication

#### `POST /api/v1/auth/register`

Request:

```json
{
   "email": "analyst@example.com",
   "password": "StrongPassword123!"
}
```

Success (`201`) response:

```json
{
   "id": "9d5f88ca-1b35-4d0c-8cc7-c2eb2a0b5ba6",
   "email": "analyst@example.com",
   "tier": "free",
   "token": "<jwt-token>"
}
```

#### `POST /api/v1/auth/login`

Request:

```json
{
   "email": "analyst@example.com",
   "password": "StrongPassword123!"
}
```

Success (`200`) response:

```json
{
   "id": "9d5f88ca-1b35-4d0c-8cc7-c2eb2a0b5ba6",
   "email": "analyst@example.com",
   "tier": "free",
   "token": "<jwt-token>"
}
```

### Query (Protected)

Use header: `Authorization: Bearer <jwt-token>`

#### `POST /api/v1/query`

Request:

```json
{
   "ioc": "8.8.8.8",
   "type": "ip"
}
```

Success (`200`) response example:

```json
{
   "queryId": "b9977061-4469-4fb4-9ad9-6587ad17fe31",
   "ioc": "8.8.8.8",
   "type": "ip",
   "riskScore": 72,
   "riskLevel": "HIGH",
   "verdict": "Malicious",
   "feeds": [
      {
         "feedName": "VirusTotal",
         "status": "success",
         "confidenceScore": 90,
         "latencyMs": 164
      }
   ],
   "mitreTechniques": [
      {
         "id": "T1071",
         "name": "Application Layer Protocol",
         "tactic": "Command and Control"
      }
   ],
   "geoLocation": {
      "country": "US",
      "city": "Mountain View"
   },
   "cachedAt": null,
   "queryDurationMs": 420
}
```

#### `GET /api/v1/query/history?page=1&pageSize=10`

Success (`200`) response:

```json
{
   "items": [
      {
         "id": "b9977061-4469-4fb4-9ad9-6587ad17fe31",
         "iocValue": "8.8.8.8",
         "iocType": "ip",
         "riskScore": 72,
         "queriedAt": "2026-04-09T12:00:00.000Z"
      }
   ],
   "total": 1,
   "page": 1,
   "pageSize": 10
}
```

#### `GET /api/v1/query/:id`

Success (`200`) response: returns the stored `ThreatProfile` for that query ID.

## Deployment

### Backend on Railway

1. Push repository to GitHub.
2. In Railway, create a new project from the repo.
3. Set the service root to `backend/`.
4. Ensure `backend/railway.toml` is detected (already added).
5. Add required environment variables in Railway (same as `backend/.env.example`, with production values).
6. Provision PostgreSQL and Redis (Railway plugins or external services) and set:
    - `DATABASE_URL`
    - `REDIS_URL`
7. Deploy. Railway will build using:
    - `npm ci && npm run build`
8. Service starts with:
    - `node dist/server.js`
9. Health check path:
    - `/health`

### Frontend on Vercel (Phase 2)

1. Create/deploy the `frontend/` React 18 app to Vercel.
2. Set project root to `frontend/`.
3. Configure environment variable:
    - `VITE_API_BASE_URL=https://<your-railway-backend-domain>`
4. Deploy and verify UI calls to backend `api/v1` endpoints.

## Known Limitations

- Frontend UI is Phase 2 and may not be present in this repository yet.
- Feed coverage is limited to currently integrated connectors (VirusTotal, AbuseIPDB, Shodan, IPInfo, Abstract Email).
- External API availability/rate limits can reduce signal quality or increase unknown/partial results.
- Current auth model uses short-lived JWT tokens only (no refresh token/session rotation flow yet).
- Correlation quality is heuristic-based and should be tuned over time with real telemetry.