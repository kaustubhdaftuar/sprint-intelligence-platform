# Sprint Intelligence Platform

> AI-powered Scrum project management with sprint risk analysis, blocker detection, and sprint retrospective assistance.

[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](docker-compose.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](api/package.json)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?logo=mongodb)](docker-compose.yml)

## Overview

Sprint Intelligence Platform combines Scrum workflows (projects, sprints, tickets, RBAC) with **async AI jobs** over **BullMQ**: sprint risk scoring, blocker detection on stale tickets, and sprint summaries for completed sprints. The API is Express + TypeScript; the worker is a separate Node service with multi-provider LLM fallback (Gemini → Anthropic → Groq).

### Core capabilities

- **Scrum:** Projects, sprint lifecycle (PLANNING → ACTIVE → DONE), tickets (TODO → IN_PROGRESS → REVIEW → DONE), membership and roles (admin, manager, developer).
- **AI (async jobs):** `score-sprint-risk`, `detect-blockers`, `generate-sprint-summary` (sprint must be **DONE**).
- **Platform:** JWT access + refresh tokens, structured logging (Pino), correlation IDs on the API, Docker Compose for MongoDB, Redis, API, and AI service.

### Repository layout (actual paths)

| Path | Role |
|------|------|
| [`api/`](api/) | REST API (port **4000** in Compose) |
| [`services/ai-service/`](services/ai-service/) | BullMQ worker + HTTP **GET /health** (port **5000**) |
| [`services/frontend/`](services/frontend/) | Vite + React + TypeScript UI (dev server; proxied `/api` → API) |
| [`docker-compose.yml`](docker-compose.yml) | MongoDB 7, Redis 7, `api`, `ai-service` |
| [`scripts/mongo-init.js`](scripts/mongo-init.js) | Optional Mongo init (mounted by Compose) |

## Architecture

```
Browser (React SPA)
        │  HTTP  (dev: Vite proxy /api → localhost:4000)
        ▼
┌───────────────────────┐
│  API  :4000           │  JWT, projects, sprints, tickets, AI enqueue
│  /health, /ready      │
└─────────┬──────┬──────┘
          │      │
          ▼      ▼
      MongoDB   Redis (BullMQ queue `ai-jobs`)
                    │
                    ▼
            ┌───────────────┐
            │ AI service    │  Worker + LLM providers
            │ :5000 /health │
            └───────────────┘
```

## Tech stack

- **API:** Node.js, Express, TypeScript, Mongoose, Zod (validators), BullMQ **Queue** (enqueue), Pino, JWT, Redis client.
- **AI service:** Node.js, BullMQ **Worker**, Mongoose (read/write aligned with API models), Gemini / Anthropic / Groq SDKs, Express (health only).
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand, React Router.
- **Infra:** Docker Compose, MongoDB 7.0, Redis 7.

## Prerequisites

- Docker + Docker Compose (recommended), **or** local Node + Mongo + Redis.
- Node.js **18+** for API; AI service Dockerfile uses Node **20**.
- A **Gemini API key** for AI jobs (`GEMINI_API_KEY`). Anthropic and Groq are optional fallbacks.

## Quick start (Docker)

Clone and create a **repo root** `.env` used by Compose for the AI service:

```bash
git clone https://github.com/kaustubhdaftuar/sprint-intelligence-platform.git
cd sprint-intelligence-platform
```

```env
# .env (root)
GEMINI_API_KEY=your-gemini-key
ANTHROPIC_API_KEY=
GROQ_API_KEY=
```

Start stack:

```bash
docker compose up -d --build
docker compose ps
```

**Containers:** `sprint-mongodb`, `sprint-redis`, `sprint-api` (service name **`api`**), `sprint-ai` (service name **`ai-service`**).

Logs:

```bash
docker compose logs -f api
docker compose logs -f ai-service
```

**Health checks**

- API liveness: `GET http://localhost:4000/health`  
  Response shape includes `"status": "healthy"`, `uptime`, `timestamp`.
- Readiness: `GET http://localhost:4000/ready` (Mongo + Redis when wired).
- AI service: `GET http://localhost:5000/health`  
  Response includes `"status": "ok"`, `timestamp`, `uptime`.

## Local development (without full stack in Docker)

### API

```bash
cd api
npm install
# Create api/.env with MONGODB_URI, REDIS_URL, JWT_* (see Configuration)
npm run dev
```

Requires MongoDB and Redis reachable from your `.env` (`MONGODB_URI`, `REDIS_URL`).

### AI service

```bash
cd services/ai-service
npm install
# set GEMINI_API_KEY, MONGODB_URI, REDIS_URL, etc.
npm run dev
```

### Frontend

```bash
cd services/frontend
npm install
npm run dev
```

Vite proxies **`/api`** to **`http://localhost:4000`**, so the SPA calls `/api/v1/...` without CORS issues during development.

To run only data stores in Docker:

```bash
docker compose up -d mongodb redis
```

## Configuration

### API (`api/.env` — typical)

| Variable | Required | Notes |
|----------|----------|--------|
| `MONGODB_URI` | Yes | Mongo connection string |
| `REDIS_URL` | Yes | Used for BullMQ queue connection |
| `JWT_ACCESS_SECRET` | Yes | Min 32 chars (validated at startup) |
| `JWT_REFRESH_SECRET` | Yes | Min 32 chars |
| `PORT` | No | Default in app env schema may differ; Compose sets **4000** |
| `API_PREFIX` | No | Default `/api/v1` |
| `LOG_LEVEL` | No | e.g. `debug`, `info` |

### AI service (`services/ai-service/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `MONGODB_URI` | Yes | Same DB as API |
| `REDIS_URL` | Yes | Same Redis; queue name default `ai-jobs` |
| `GEMINI_API_KEY` | Yes | Primary LLM |
| `ANTHROPIC_API_KEY` | No | Fallback |
| `GROQ_API_KEY` | No | Fallback |
| `PORT` | No | Default **5000** |
| `QUEUE_NAME` | No | Must match API queue name |
| `CONCURRENCY` | No | Worker concurrency |

### Docker Compose

Root `.env` supplies `GEMINI_API_KEY` (and optional keys) to **`ai-service`** as in [`docker-compose.yml`](docker-compose.yml).

## Usage (curl)

Auth responses nest tokens under **`data.tokens`**:

```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "name": "...", "role": "..." },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    }
  }
}
```

Use `Authorization: Bearer <accessToken>` on protected routes.

**Register**

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@company.com","password":"SecurePass123!","name":"Alice","role":"manager"}'
```

**Login**

```bash
curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@company.com","password":"SecurePass123!"}'
```

**Create project** (manager/admin)

```bash
TOKEN="<accessToken>"

curl -s -X POST http://localhost:4000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Demo","description":"Demo project"}'
```

**Sprints and tickets** — nested under `/api/v1/projects/:projectId/...` (see route files under `api/src/routes/`).

### AI jobs (all require auth)

| Method | Path | Body |
|--------|------|------|
| POST | `/api/v1/ai/score-sprint-risk` | `{ "sprintId": "<id>" }` |
| POST | `/api/v1/ai/detect-blockers` | `{ "sprintId": "<id>" }` |
| POST | `/api/v1/ai/generate-sprint-summary` | `{ "sprintId": "<id>" }` (sprint must be **DONE**) |
| GET | `/api/v1/ai/jobs/:jobId` | — |

Enqueue returns **202** with `data.jobId` (and queued status). Poll **GET** until `status` is `completed` or `failed`; completed jobs include `data.result`.

Risk scoring updates the sprint’s persisted `riskScore` in MongoDB; blocker detection may set `isBlocked` / `blockedReason` on tickets.

## API surface (summary)

- **Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, authenticated profile routes under `auth`.
- **Projects:** CRUD + members under `/projects`.
- **Sprints:** under `/projects/:projectId/sprints` (create, list, get, update, start, complete, assign/remove tickets).
- **Tickets:** under `/projects/:projectId/tickets` (CRUD, status transitions, comments).
- **AI:** enqueue + job status as above.

Full behavior lives in `api/src` (validators enforce shapes and RBAC).

## Development

### Useful scripts

**API** (`api/`): `npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run lint`, `npm run format`

**AI service** (`services/ai-service/`): `npm run dev`, `npm run build`, `npm start`

**Frontend** (`services/frontend/`): `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`

### Project tree (abbreviated)

```
sprint-intelligence-platform/
├── api/
│   └── src/           # app.ts, server.ts, routes/, controllers/, services/, ...
├── services/
│   ├── ai-service/
│   │   └── src/       # jobs/, workers/, llm/, models/, server.ts
│   └── frontend/
│       └── src/       # pages/, components/, lib/, store/
├── scripts/
│   └── mongo-init.js
└── docker-compose.yml
```

There is **no** `docker-compose.prod.yml` or `docs/` folder in-repo yet; add them if you standardize production deploys or split documentation.

## Testing

- **API:** Jest (`npm test` in `api/`). Add spec files under `api/src` as you grow coverage.
- **AI service:** placeholder `test` script; replace with a real runner when you add tests.
- **E2E / integration:** not wired globally; use CI or a dedicated package when you introduce them.

## Troubleshooting

- **Jobs stay `waiting`:** ensure `ai-service` is running and Redis is reachable; check `docker compose logs ai-service`.
- **401 after login in SPA:** API returns tokens in `data.tokens`; persist `accessToken` (and refresh) correctly.
- **Mongo auth errors:** align `MONGODB_URI` with Compose credentials (`admin` / `devpassword` in default Compose).
- **Gemini model errors:** configure a valid model name in `services/ai-service/src/llm/llm-client.ts` for your API tier.

## Contributing

1. Branch from `main`, keep changes focused.
2. Match existing TypeScript and layering patterns in `api/`.
3. Prefer conventional commits (`feat:`, `fix:`, `docs:`, …).

## Roadmap (high level)

| Phase | Status | Notes |
|-------|--------|--------|
| **Backend + AI jobs** | Largely in place | Risk, blockers, sprint summary; queue retries; AI `/health` |
| **Frontend** | In progress | Auth, projects/sprints navigation, AI panel; Kanban, charts, polish TBD |
| **Enhanced AI** | Partial / planned | Planning assistant, velocity forecasting, scheduled blocker sweeps |
| **Integrations** | Planned | Email, Slack, calendars |
| **Analytics & reports** | Planned | Burndown, velocity dashboards |
