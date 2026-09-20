# Publish flow

## Connect (once)

1. Create a Roam **temporary append-only** graph token (`roam-graph-token-…`).
2. Extension **Settings** → paste into **Roam temporary token**.
3. Confirm **Server URL** (default `https://roampub.up.railway.app`) or use palette **Connect**.
4. Click **Connect** (or command **Roam Publish: Connect (exchange token)**).
5. Extension `POST /api/auth/exchange` with `{ roamToken, graphName }`.
6. Server returns `{ apiKey }` → stored in Settings; Roam token field cleared.
7. **Side effect on web:** a small auth-check block may be appended under page `Roam Publish` / `Auth checks`.

## Publish

1. User runs Publish Page / Block (slash, palette, or context menu).
2. Extension requires an API key; resolves uid via Alpha UI APIs.
3. Serializes content as `roam-json-v1` (`content.js`).
4. `POST /api/publish` with Bearer key → upsert; response includes public `url`.
5. Cache upsert → badge/chip paint. Default visibility: **unlisted**.

Public URL shape: `/{graphName}/{uid}` on the server base (e.g. `https://roampub.up.railway.app/ejqs-develop/<uid>`).

## Share / update / unpublish

- Share popover: visibility + block scope → `PATCH /api/publish/:uid`
- Update (outdated): upsert again via `POST /api/publish`
- Unpublish: `DELETE /api/publish/:uid`

## Refresh

`GET /api/publish` fills the local cache (empty if not connected).
