# Build and load

```bash
cd /agent/repos/roam-publish
npm install
npm run build   # → extension.js
```

Ship **both** `extension.js` and `extension.css`.

## Roam Depot

Install/load the built files as a Depot extension (or local roam/js wrapper that imports the ESM bundle).

## Local smoke (VM)

Previous smoke used a CORS static server + roam/js loader against `ejqs-develop` only. After rebuild, re-copy `extension.js` / `extension.css` to the serve folder and reload.

Hard rule: only graph **`ejqs-develop`** for live Roam testing.
