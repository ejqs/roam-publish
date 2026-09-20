# Testing

## Automated

```bash
npm run build
node --check extension.js
```

No unit/E2E suite yet.

## In Roam (required for product checks)

1. Open graph **`ejqs-develop` only**.
2. Load built `extension.js` + `extension.css`.
3. Settings → paste append-only token → Connect.
4. Publish page → badge + live URL on Railway.
5. Publish block (focus a block) → chip; share popover visibility/scope.
6. Edit → outdated → Update.
7. Confirm find-or-create / command palette do not leave stuck badges.

See Project store `docs/testing.md` for desktop/VM launch details.
