# Changelog

All notable changes to the Roam Publish extension. Dates are when the change landed on `main`.

## Unreleased

### Shortlink and change log
- Graphs without a change log (no append-only token stored on roam.pub) no longer get an empty **Changelog** block
  under each shortlink. It's added on the next publish once the graph has a change log.

## 0.1.0 (2026-10-02)

First release.

### Publishing
- Publish a page or block from the context menu, or the current page from the command palette. The public link is
  copied to your clipboard; publishing again updates the live page, or says nothing changed.
- Unpublish pages and blocks, and sync the list of what you've published from the server.
- New pages and blocks are published **unlisted**. Make them public or unlisted again from the toast or the context
  menu.
- Embeds, view types (numbered, document), text alignment and heading levels are sent. Block references are inlined,
  and references inside code and block-ref aliases are left as written.
- Server moderation messages and reasons are shown when a publish is refused.

### Setup and settings
- Paste the API key from the website into **Settings → Roam Publish**. The extension no longer reads your daily
  notes to finish setup.
- **Author name** setting, shown as the byline where the graph or collection shows authors.
- **Open dashboard** button replaces the published list in settings.
- Encrypted graphs are supported.
- Defaults to the `https://roam.pub` server (changeable under **Server URL**).

### Shortlink and change log
- Publishing a page adds a block with its permanent `roam.pub/p/…` shortlink and a **Changelog** block under it,
  where roam.pub records what happens to the page (needs an append-only token).
- Settings: **Add shortlink block**, **Shortlink tag**, **Shortlink position**, and **Shortlink block on published
  blocks** (off by default: only pages get one).
- **Check change log** asks roam.pub whether it can still write to the change log, and warns once per session if Roam
  stopped accepting the token.
- While Roam is open, the extension confirms every few minutes that Changelog blocks still exist (uids only), so
  roam.pub never writes to a deleted block.

### Docs
- README covers setup, usage, settings and what the extension reads, sends and stores.
