# roam-publish (simple prototype)

Publish Roam pages/blocks to [roam-publish-web](https://github.com/ejqs/roam-publish-web).

## What it does

1. Settings: paste Roam append-only token → **Connect** → stores API key
2. Publish / Unpublish via command palette, slash, or context menu
3. Alerts show the live URL (`https://roampub.up.railway.app/<graph>/<uid>`)

No teams, overlays, share popover, or outdated scanner.

## Build

```bash
npm install && npm run build
```

Load `extension.js` + `extension.css` in Roam (Depot or roam/js). **Only use graph `ejqs-develop` for testing.**

## Commands

- `Roam Publish: Connect (exchange token)`
- `Roam Publish: Publish Page` / `Publish Block` / `Unpublish open`
- Context menus on page / block
