# KMegle

Video and text chat for adult IIIT Kottayam students, using Firebase sign-in,
Socket.IO matchmaking/signaling and WebRTC with direct connectivity and TURN fallback.

## Development and checks

Use Node 24 (`.nvmrc`). Run `npm ci` separately in `backend`, `frontend` and
`benchmarks`. Keep environment files and credentials local.

- Backend: `npm test`, then `npm run dev` with the required service configuration.
- Frontend: `npm test`, `npm run lint`, `npm run build`; `npm run dev` starts Next.js.
- Browser checks: in `benchmarks`, run `npx playwright install chromium`, then
  `npm run test:ui` and `npm run test:worker`. These use local fake services and
  synthetic media, not production accounts.
- The migration integration test runs only when `TEST_DATABASE_URL` explicitly
  points to a disposable database. It never falls back to `DATABASE_URL`.

## Deployment requirements

- Backend startup applies `backend/migrations` transactionally before listening.
  Validate against staging and the existing schema before using production.
  Incompatible legacy columns or duplicate block pairs require review; startup
  fails instead of performing destructive repair.
  Migration SQL has transaction-local statement/lock deadlines; runtime requests
  keep a separate client query deadline. Do not add PostgreSQL timeout parameters
  to pooled connection startup packets: Neon/PgBouncer can reject them.
  SQL files must be UTF-8; the loader strips an optional leading byte-order mark
  so Windows-written migrations are parsed correctly. Startup failures log the
  migration filename, stage and redacted database error rather than hiding it.
- Deploy frontend and backend protocol **2** together. Old clients must reload.
  Run a single backend instance: matchmaking, presence and recent safety targets
  are held in process memory.
- Configure backend Firebase credentials, `DATABASE_URL`, `EMAIL_HASH_SECRET`,
  `TURN_API_KEY`, `METERED_APP_NAME` and any `ALLOWED_ADMIN_UIDS` outside Git.
  College email is the default eligibility policy. Leave `TEST_ACCOUNT_EMAILS`
  empty for the normal production student service.
- Set `BACKEND_URL` at frontend **build time**. Compose uses the internal target
  `http://backend:5000`; `NEXT_PUBLIC_BACKEND_URL` is a separate browser-reachable
  URL for local direct access.
- Frontend Docker builds exclude `.env*`. Supply the public Firebase client
  configuration through the six `NEXT_PUBLIC_FIREBASE_*` build arguments.
  `docker compose --env-file frontend/.env.local build` supplies these variables;
  backend secrets remain runtime-only.
- Keep explicit CORS origins. Verify the deployed proxy chain before changing
  `TRUST_PROXY_HOPS` (default 1). Check `/api/health` for liveness and
  `/api/health/ready` for database readiness.
- Versioned account agreement is checked before matching. Update its client and
  server version together when changing the required agreement.

## Connection diagnostics and release checks

Normal calls keep direct-capable ICE with TURN fallback. For opt-in staging,
build with `NEXT_PUBLIC_CONNECTION_DIAGNOSTICS=true` and compare `/chat?ice=host`,
`?ice=stun`, `?ice=all` and `?ice=relay` on both devices. **Devices → Save network
snapshot** downloads candidate types and connection/media metrics without IPs,
candidate strings, SDP, credentials, identities or chat text. Nothing is uploaded
automatically. Sharing a public NAT does not guarantee a direct path.

Before release, validate actual Firebase/database/provider integration, proxy and
forced-relay behavior, campus network switching, and real mobile permissions,
keyboard, playback and accessibility. Local synthetic browser checks do not
establish physical campus or phone reliability.

Reports are allegations, not automatic peer penalties. Saved acknowledgments
follow durable writes; bounded in-memory retry receipts can be lost on server
restart. The UI reports uncertainty instead of claiming success. Retention and
provider practices still need operational confirmation.

Security follow-up: eight indirect moderate backend advisories remain in the
Firebase Admin dependency tree; frontend runtime audit was clean when this change
was validated. Track upstream fixes rather than forcing incompatible dependency
downgrades. Run fresh audits before release.
