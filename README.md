# upihelp-backend

Thin backend for the **UPI Help** mobile app. Provides remote config, an
update/version gate, in-app announcements, and server-side event ingest
(with optional forwarding to the Facebook Conversions API).

- **Stack:** Node 20 · TypeScript · Fastify 5 · Prisma 6 · PostgreSQL
- **Deploy:** single container (Dockerfile) on the shared Coolify server,
  using a dedicated database on the shared Postgres.
- Designed to grow with the app as it becomes multi-tab (the WebView is one tab).

## Endpoints

### Public (read-only, rate-limited 120/min/IP)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + DB check (used by Docker/Coolify) |
| GET | `/api/v1/bootstrap?platform=&version=` | One launch call: config + update gate + announcements |
| GET | `/api/v1/config?platform=` | Remote config only |
| GET | `/api/v1/version-check?platform=&version=` | Update gate only |
| GET | `/api/v1/announcements?platform=&version=` | Active announcements only |
| POST | `/api/v1/events` | Ingest an event (`x-app-key` required only if `APP_INGEST_KEY` is set) |

`POST /api/v1/events` body:
```json
{ "name": "AppOpened", "platform": "ios", "appVersion": "1.0.0", "deviceId": "optional", "params": {} }
```

### Admin (require header `x-admin-key: $ADMIN_API_KEY`)
| Method | Path | Purpose |
|---|---|---|
| GET / PUT | `/api/v1/admin/config` | Read / upsert remote config (per platform `all`/`ios`/`android`) |
| GET / PUT | `/api/v1/admin/app-versions` | Read / upsert the version gate per platform |
| GET / POST | `/api/v1/admin/announcements` | List / create announcements |
| PATCH / DELETE | `/api/v1/admin/announcements/:id` | Update / delete an announcement |
| GET | `/api/v1/admin/events` | Recent events (`?name=&limit=`) |
| GET | `/api/v1/admin/events/stats` | Event counts grouped by name |

## Environment

See `.env.example`. Required: `DATABASE_URL`, `ADMIN_API_KEY`. Optional:
`APP_INGEST_KEY` (lock down event ingest), `FB_APP_ID` + `FB_CAPI_ACCESS_TOKEN`
(enable server-side FB forwarding; dormant until both are set), `PORT`
(default 3000), `CORS_ORIGIN`.

> `DATABASE_URL` host must be the shared Postgres **container name**
> (`tod9m3eq8aady2f9ar6z8ciy`), never `localhost`. Get the full URL from
> `create-app-db upihelp-backend` on the server.

## Local development

```bash
npm install
cp .env.example .env          # point DATABASE_URL at any Postgres you control
npx prisma migrate deploy     # or: npm run migrate:dev
npm run dev                   # tsx watch on :3000
```

## Build / run (what the container does)

```bash
npm run build                 # prisma generate + tsc -> dist/
npx prisma migrate deploy     # apply migrations (DB must be reachable)
npm start                     # node dist/server.js
```

The Dockerfile runs `prisma migrate deploy` then starts the server, and seeds
default config + version rows on first boot (idempotent — see
`src/services/data.ts`).

## Schema

`RemoteConfig`, `AppVersion`, `Announcement`, `Event` — defined in
`prisma/schema.prisma`. No special Postgres extensions required, so it runs on
the shared `postgres:16-alpine`.

## Notes

- Server-side FB Conversions API forwarding lives in `src/services/fbCapi.ts`
  and stays a no-op until a CAPI access token is configured. Validate the
  payload against your Meta app's Events Manager test events when you enable it.
- The mobile app can call `/api/v1/bootstrap` at launch to pick up config and
  update-gate changes without a new store release.
