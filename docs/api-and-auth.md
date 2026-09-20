# API and auth

## Settings (Depot panel)

| Setting | Purpose |
| --- | --- |
| `api-base` | roam-publish-web origin (default Railway URL) |
| `roam-token` | Temporary append-only Roam token (cleared after Connect) |
| Connect button | Runs exchange |
| `api-key` | Bearer key for publish APIs (auto-filled or paste) |
| Disconnect | Clears API key + token |
| `debug-hud` | Optional HUD |

Palette shortcuts: **Connect (exchange token)**, **Connection status**.

## Client

`src/api.js` implements the Project store contract:

- `POST /api/auth/exchange` (no Bearer)
- `GET|POST /api/publish`, `PATCH|DELETE /api/publish/:uid` (Bearer)

Authoritative contract: `/cursor/stores/…/docs/api-contract.md` (and web repo docs when present).

## Graph binding

Graph name is read from the Roam URL (`#/app/<graph>/…`). The API key returned by exchange is bound to that graph on the server; publish bodies do **not** re-send `graphName`.
