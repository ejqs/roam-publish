# Architecture

## Entry

- `src/index.js` — onload/onunload: settings, commands, overlays, cache refresh
- Build: `npm run build` → ESM `extension.js` (+ `extension.css` loaded separately)

## Modules

| Module | Role |
| --- | --- |
| `api.js` | Real HTTP to roam-publish-web (Bearer API key) |
| `settings.js` / `settings-store.js` | Depot panel: server URL, Roam token, Connect, API key |
| `graph.js` | Graph name from `#/app/<name>/…` |
| `content.js` | `roam-json-v1` serialization from Alpha pull |
| `publish.js` | publish / unpublish / share / republish / refresh |
| `cache.js` / `state.js` | In-memory publish Map + listeners |
| `target.js` / `roam.js` | Resolve uid; pulls; fingerprints |
| `commands.js` | Slash, palette, context menus |
| `share-popover.js` | Visibility + scope (no teams) |
| `published-list.js` | Published items dialog |
| `overlays/**` | Page badges, block chips, debug HUD |
| `styles.js` / `watcher.js` / `outdated.js` | Block CSS, observers, drift |

## Hot path

Paint/scroll must stay **DOM-only** — no rate-limited `roamAlphaAPI` calls.

## Removed (prototype)

`groups.js` / teams UI — out of scope for the launchable slice.
