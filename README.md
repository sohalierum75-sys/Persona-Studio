# Persona Studio

Studio and the Manifest V3 Chrome extension share a Node.js/TypeScript API, PostgreSQL, and Prisma. Existing editors remain in place. The original `PersonaStudio` IndexedDB database is preserved; signed-in workspaces use separate databases per account.

## Local startup

Requires Node.js 22.12+ and PostgreSQL 16+, or Docker Compose. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

1. Run `npm ci` in the root and `npm ci --prefix server`.
2. Copy `.env.example` to `.env.local` for the frontend. Copy `server/.env.example` to `server/.env`. Keep existing files if they already contain your configuration.
3. Set `DATABASE_URL`, a random `JWT_SECRET`, and the Google credentials in `server/.env`. Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
4. For Docker PostgreSQL, also copy `.env.example` to root `.env`, set `POSTGRES_PASSWORD` to a random **hex** password, and run `docker compose up -d db`. Match that password in the backend `DATABASE_URL`. Existing PostgreSQL is also supported; create a dedicated `persona_studio` database and role.
5. In `server/`, run `npm run generate`, `npm run migrate:deploy`, then `npm run dev`.
6. In another terminal, run root `npm run dev`. Open `http://localhost:5173`.
7. Run root `npm run build`. In `chrome://extensions`, enable Developer mode and load the `dist/` directory. The build writes the correct API host permission into `dist/manifest.json`.

The backend defaults to port 3210. `VITE_API_URL` must be the same backend URL for both clients. An empty `VITE_API_URL` explicitly enables the original local-only app. Rebuild the extension after changing this value.

If this checkout has PostgreSQL installed in `.local-postgres`, start it after a Windows restart with
`powershell -ExecutionPolicy Bypass -File server/scripts/start-local-postgres.ps1` from the project root,
then start the API and frontend as above. This instance listens on `127.0.0.1:5432`; its persistent
data is in `.local-postgres/data`. The ignored directory also contains local credentials and the
backend environment backup. Preserve it and include its database in your backups. It is not a Windows service.

For a containerized local app and database, configure both environment files, then run `docker compose up --build -d`; Studio is served at `http://localhost:3210`. Include that origin in `ALLOWED_ORIGINS`.

## Floating Chrome panel

After loading or reloading `dist/` in Chrome 116+, pin Persona Studio and click its toolbar icon on an HTTP or HTTPS webpage. The existing workspace opens over the page. Drag its top bar to move it, drag the bottom-right handle to resize it, or focus either control and use arrow keys (Shift moves faster). Minimize keeps selections and work loaded; clicking the extension again restores the same panel. Close removes the overlay. Size and position are remembered and kept inside the viewport. Full navigations require clicking the icon again; same-page navigation keeps the panel open.

The overlay uses Shadow DOM and an extension-origin frame, keeping styles, account storage, sign-in, sync, prompt copying, and the full Studio separate from the host website. Injection uses `activeTab` and `scripting`; there is no `sidePanel` or `tabs` permission. `clipboardWrite` keeps prompt copying available in the embedded UI. Chrome's own pages, the Chrome Web Store, and restricted viewers cannot host injected extensions; a toolbar badge and tooltip explain when a page blocks injection.

Run `npm run package:extension` to produce `dist/download/persona-studio-extension-v1.2.0.zip`. Unzip it and load the extracted directory, or load `dist/` directly. The configured API URL and pinned extension identity are preserved by the build.

`npm run test:extension` builds the extension and runs background and browser checks on plain, hostile-CSS, and restrictive-CSP/permissions-policy webpages, including dragging, resizing, keyboard controls, page scrolling, SPA replacement, small screens, prompt copying, and full Studio access. Browser fixtures use test-only host grants and a mocked account API; the production manifest uses the toolbar's temporary grant. Set `TEST_PUBLIC_PAGES=1` to additionally check Example Domain, Wikipedia, and Chrome's extension documentation. Screenshots are saved under `test-results/overlay-*/`. Install full Chromium with `npx playwright install chromium` if needed.

## Google OAuth

Create a Google OAuth client of type **Web application**. Both clients use this one server-side client. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` only in `server/.env`.

Register these authorized redirect URIs as applicable:

- Local: `http://localhost:3210/api/auth/google/callback`
- Production: `https://studio.example.com/api/auth/google/callback`

Set `PUBLIC_BASE_URL` to the API's externally reachable origin. Set `ALLOWED_ORIGINS` to the exact Studio origins (comma-separated). Web return paths accepted by this app are `/` and `/index.html`.

Load the extension and copy its ID from `chrome://extensions`. Set `EXTENSION_REDIRECT_PREFIXES=https://YOUR_EXTENSION_ID.chromiumapp.org/` on the server. Despite the legacy variable name, these URLs are compared **exactly**, not by prefix. This is Chrome's final client return URL; Google's registered callback remains the backend callback above. No Google secret, `oauth2` manifest entry, or placeholder extension signing key belongs in the extension. Keep a stable published extension ID and register development IDs separately.

Configure the Google consent screen and add test users while the OAuth app is in testing. Website and extension identities are keyed by Google's stable `sub`, never by a client-supplied email. Authentication uses a signed state, a browser-bound HttpOnly callback cookie, a client PKCE challenge/verifier for the one-time application code, single-use exchanges, short-lived bearer access tokens, and hashed rotating refresh tokens. Web session credentials persist in localStorage; extension credentials persist in `chrome.storage.local`. Deploy the supplied CSP and keep third-party scripts off the Studio origin.

Provider documentation: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Chrome identity](https://developer.chrome.com/docs/extensions/reference/api/identity).

## Storage, sync and migration

- Every document, image request, history read and mutation is owner-scoped. The backend checks referenced characters, episodes, scenes, outfits, locations, continuity groups and images.
- Documents retain the existing character/scene/prompt shape in PostgreSQL JSONB. Each accepted change has a version and immutable history entry. Scene `order` is authoritative; episode/group membership is derived from owned children.
- Reference images are durable, private asset documents in PostgreSQL. Authenticated `POST /api/assets` accepts the same operation format as sync; `GET /api/assets/:id` returns a private data URL. There is no public image bucket. Raster MIME, signature and size checks reject active SVG/HTML and images over 8 MiB.
- A cache update and its queue entry commit in one IndexedDB transaction. Retry IDs are unique per revision; server receipts survive newer edits. Acknowledging an in-flight revision never drops a newer local revision.
- Login/panel open, focus, visibility and reconnect trigger reconciliation. Visible clients poll every 10 seconds. Full reconciliation intentionally avoids missed timestamp-cursor commits. Images are included, so this is suited to modest workspaces; large installations should add paginated metadata and separate blob transfers before increasing scale.
- Server versions detect concurrent edits; the conflict UI compares records and lets the user keep a local edit/deletion or accept the server version. Pending changes stay with their original account through sign-out and switching. Parent deletion creates dependent tombstones and removes optional references. Tombstones and retry receipts are retained indefinitely so long-offline clients cannot resurrect deletions.
- First sign-in creates an immutable local backup **before** loading cloud data. Import is offered for the preserved local workspace. It downloads a JSON backup, remaps project IDs consistently, uploads in dependency order, and checkpoints each server-confirmed operation. Retrying resumes without duplicates. Existing account settings are kept; imported local settings are retained in account metadata and the backup. Settings supports restoring both full ZIP backups and migration JSON backups.

API examples (all except auth require `Authorization: Bearer ACCESS_TOKEN`):

```json
POST /api/sync/ops
{"ops":[{"opId":"unique-operation-uuid","kind":"character","id":"record-uuid","type":"put","baseVersion":0,"data":{"id":"record-uuid","name":"Mira","referenceAssetIds":[],"identityFields":[]}}]}
```

`baseVersion: 0` creates; updates/deletes use the last server version. Never reuse an operation ID with changed content. `GET /api/sync` includes tombstones. `GET /api/sync/history/:kind/:id` returns up to 100 recent versions; all versions remain stored.

## Deployment and persistence

The root Dockerfile builds both clients and the API. The Compose database uses a named persistent volume; image data lives in that same database. Never run `docker compose down -v` against production data.

1. Replace `studio.example.com` in `deploy/Caddyfile`. Point DNS to the host and permit ports 80/443.
2. Set root `PUBLIC_BASE_URL=https://studio.example.com`, `NODE_ENV=production`, and a random database password. Set backend `PUBLIC_BASE_URL`, `ALLOWED_ORIGINS`, Google credentials and a strong JWT secret. Set `ALLOW_TEST_LOGIN=false`.
3. Run `docker compose -f compose.yaml -f deploy/compose.production.yaml up --build -d`.
4. Register the production OAuth callback and extension ID. Distribute the extension built with the production `VITE_API_URL`.

Caddy provides HTTPS and restrictive browser security headers. PostgreSQL and the API bind only to loopback on the host. The app refuses production startup with test login enabled or without an HTTPS public URL. Put secrets in your host secret manager; do not commit them. For multiple API replicas, perform migrations once as a release job and enforce shared auth request limits at the edge. The per-owner PostgreSQL transaction lock makes mutations safe across replicas; polling works across replicas without a shared realtime service.

Existing installations: migration `20260930000000_sync_integrity` adds retry receipts and PKCE-bound codes without removing project data. The earlier compatibility migration now safely skips tables that do not exist yet on a fresh installation. Take a database backup before upgrading. Existing unexchanged OAuth codes cannot be used after this change; start login again.

## Backups and restore

Back up PostgreSQL (including images, version history, receipts and tombstones), the deployment environment/secrets in an encrypted secret store, and Caddy's persistent configuration. Example commands avoid binary shell redirection, including on Windows:

```sh
mkdir backups
docker compose exec db pg_dump -U persona -Fc -f /tmp/persona.dump persona_studio
docker compose cp db:/tmp/persona.dump ./backups/persona.dump
```

Schedule daily backups and copy encrypted archives off-host. Retain daily/weekly copies and regularly test restoration to a **separate** database. For a restore drill, create `persona_restore`, copy the archive into the database container and run `pg_restore -U persona -d persona_restore /tmp/persona.dump`; point an isolated API at it and verify characters, prompts and images before any production cutover. Browser ZIP/JSON exports are additional recovery copies, not a replacement for database backups.

## Verification

```sh
npm test
npm run build
npm --prefix server run build
npm --prefix server test
```

Backend tests require an accessible PostgreSQL URL in `server/.env` whose role may create a temporary schema. They create isolated `verify_*` schemas, apply **all** migrations from scratch, and remove the test schema afterward. The browser integration test launches Vite on port 5178 and a real unpacked extension, with temporary browser profiles. Install the test browser with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium executable. The test rebuilds `dist/` with a temporary API URL; run `npm run build` again afterward for a usable extension package.

Tests cover Google callbacks with mocked provider responses, repeat identity mapping, PKCE/code replay, isolation via direct requests, image privacy/validation, concurrent version checks, bulk retry/order/deletion, refresh rotation, IndexedDB queue persistence, in-flight edits, account switching, browser restart, the real extension, and legacy import/retry. Real Google consent/account selection and production hosting require your external configuration and a live acceptance test. Docker deployment itself needs Docker available on the target host.

For local API-only testing without Google, `ALLOW_TEST_LOGIN=true` enables `POST /api/auth/test-login` with an email. This endpoint is unavailable in production and is not exposed as a login button. Never enable it on a publicly reachable development server.
