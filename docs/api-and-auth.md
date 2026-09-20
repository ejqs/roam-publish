# API and auth

1. Paste Roam `roam-graph-token-…` in Settings
2. **Connect** → `POST /api/auth/exchange` with `{ roamToken, graphName }`
3. Store `apiKey`; clear token field
4. Publish → `POST /api/publish` with `Authorization: Bearer <apiKey>`
5. Unpublish → `DELETE /api/publish/{uid}`

Graph name comes from `#/app/<graph>/…`.
