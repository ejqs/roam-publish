# Changelog

All notable changes to the Roam Publish extension. Dates are when the change landed on `main`.

## Unreleased

### Publishing
- Uses the website's words for where a page is listed: **Unlisted**, **Listed** and **Discoverable**. **Make public**
  is now **Make listed**.
- **Make discoverable** puts a page on your graph's front page and on Discover, right from the toast. When a page
  can't be Discoverable (for example, it has a password or search engines are off), the status toast says why.
- Making a Discoverable page listed or unlisted asks first, as the website does, so a page isn't taken off
  Discover by a stray click.
- The confirm toasts for taking a page off Discover and for **Unpublish** have a **Cancel** button.

## 0.1.0 (2026-10-04)

First release.

### Publishing
- Publish, republish or unpublish a page or block from its right-click menu: **Roam Publish: Page…** and **Roam
  Publish: Block…** say whether it's not published, published and up to date, or changed since you last published it,
  with buttons for what you can do (Publish, Republish, Make public / unlisted, Unpublish). They check the server for
  the latest state first.
- Command palette: **Publish**, **Unpublish** and **status** for the current page or the focused block. Publishing the
  current page publishes the page even when you're zoomed into one of its blocks.
- The public link is copied to your clipboard; publishing again updates the live page, or says nothing changed. Publish
  always checks with roam.pub, so a page unpublished or removed on the website is published again or says why not.
- **Unpublish** asks first, and says what's deleted on roam.pub with the page (access settings, passwords, views,
  upvotes, places in collections).
- New pages and blocks are published **unlisted**: only people with the link can see them. **Make public** is right in
  the toast.
- Embeds (every one, when a block has several), view types (numbered, document), text alignment and heading levels
  are sent. Block references are inlined, and references inside code and block-ref aliases are left as written.
- Server moderation messages and reasons are shown when a publish is refused, and the Roam Publish block written for
  it is taken back out of your page.
- Toast links only open web (http/https) addresses, whatever the server returns. Toasts are announced by screen
  readers.

### Status link and change log
- Publishing a page adds a **[[Roam Publish]]** block with the page's permanent **[Roam Publish Status](…/p/…)** link,
  and roam.pub writes a change log of what happens to the page directly under it (needs an append-only token). The
  link is for you and your graph's members, not for sharing; the block itself is never published. A status link you
  paste under an ordinary block leaves out only the link, and is never mistaken for the page's own block.
- Settings: **Add Roam Publish block when publishing pages** (on) and **when publishing blocks** (off), **Block tag**,
  **Status link text** (blank for the bare link) and **Block position**. Changes apply to existing blocks the next time
  you publish them. **Reset Roam Publish block settings** restores the defaults, since Roam keeps an extension's
  settings after it's uninstalled.
- **Change log → Open settings** opens the graph's change log settings on roam.pub, where its owner can check it
  works, manage the token, and turn it off or back on. The extension warns once per session if Roam stopped accepting
  the token.
- While Roam is open, the extension confirms every few minutes that those blocks still exist (uids only), so roam.pub
  never writes to a deleted block, however many pages you've published.

### Setup and settings
- **Dashboard** opens roam.pub at your API keys until you've added one, then at the dashboard. Paste the key into
  **API key**; the extension doesn't read your daily notes.
- **Author name**, shown as the byline where the graph or collection shows authors.
- **Sync published list** refreshes what the extension knows you've published, if a status looks wrong.
- Encrypted graphs are supported. On a shared graph, pages another member published show their status only.
- Defaults to the `https://roam.pub` server (changeable under **Server URL**, which must use `https://`, so the key is
  never sent unencrypted).

### Docs
- README covers setup, usage, settings and what the extension reads, sends and stores.
