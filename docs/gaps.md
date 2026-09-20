# Gaps

- End-to-end depends on web deploy having `/api/auth/exchange` and `/api/publish` live.
- Depot settings `button` actions vary by Roam version — palette **Connect** is the reliable fallback.
- roam/js auto-load on reload is flaky on the VM desktop app; manual console load works.
- No automated tests.
- Outdated detection uses local edit time / fingerprint only (not server-driven).
- Content is a best-effort Alpha pull tree; media/embeds not specially handled.
- Teams/groups intentionally removed for this prototype.
