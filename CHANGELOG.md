# Changelog

All notable changes to the Roam Publish extension. Each version is dated when it was sent to Roam Depot; roam.pub's
What's new shows it once Roam Depot serves it. Every bullet starts with **New:**, **Improved:** or **Fixed:**.

## 0.1.0 (2026-10-07)

First release.

### Publishing
- New: Publish, republish or unpublish a page or block from its right-click menu: **Roam Publish: Page…** and **Roam
  Publish: Block…** say whether it's not published, published and up to date, or changed since you last published it,
  with buttons for what you can do (Publish, Republish, Make listed / discoverable / unlisted, Unpublish). They check
  the server for the latest state first.
- New: Command palette: **Publish**, **Unpublish** and **status** for the current page or the focused block.
  Publishing the current page publishes the page even when you're zoomed into one of its blocks.
- New: The public link is copied to your clipboard; publishing again updates the live page, or says nothing changed.
  Publish always checks with roam.pub, so a page unpublished or removed on the website is published again or says why
  not.
- New: Pages use the website's words for where they're listed: **Unlisted**, **Listed** and **Discoverable**. New
  pages and blocks are published **unlisted**: only people with the link can see them. **Make listed** and **Make
  discoverable** are right in the toast; Discoverable puts a page on your graph's front page and on Discover.
- New: When a page can't be Discoverable (for example, it has a password or search engines are off), the status toast
  says why.
- New: Making a Discoverable page listed or unlisted asks first, as the website does, so a page isn't taken off
  Discover by a stray click.
- New: **Unpublish** asks first, and says what's deleted on roam.pub with the page (access settings, passwords, views,
  upvotes, places in collections). Confirm toasts have a **Cancel** button.
- New: Every Roam Publish toast has a **Close** button, and toasts stay open while your pointer or keyboard focus is
  in them.
- New: **Add to collection…** on the publish and status toasts puts a page in one of your collections, from a
  dropdown that says how it starts out in each one (listed, on Discover, password-protected or members only). The
  page stays in your graph as it is, the same as adding it on roam.pub.
- New: **Make listed** says what lists the page. When your graph's front page is turned off, it says nothing lists
  the page yet, and the status toast says so too.
- New: Embeds (every one, when a block has several), view types (numbered, document), text alignment and heading
  levels are sent. Block references are inlined, and references inside code and block-ref aliases are left as written.
- New: Server moderation messages and reasons are shown when a publish is refused, and the Roam Publish block written
  for it is taken back out of your page.
- New: Toast links only open web (http/https) addresses, whatever the server returns. Toasts are announced by screen
  readers.

### Status link and change log
- New: Publishing a page adds a **[[Roam Publish]]** block with the page's permanent **[Roam Publish Status](…/p/…)**
  link, and roam.pub writes a change log of what happens to the page directly under it (needs an append-only token).
  The link is for you and your graph's members, not for sharing; the block itself is never published. A status link
  you paste under an ordinary block leaves out only the link, and is never mistaken for the page's own block.
- New: Settings: **Add Roam Publish block when publishing pages** (on) and **when publishing blocks** (off), **Block
  tag**, **Status link text** (blank for the bare link) and **Block position**. Changes apply to existing blocks the
  next time you publish them. **Reset Roam Publish block settings** restores the defaults, since Roam keeps an
  extension's settings after it's uninstalled.
- New: **Change log → Open settings** opens the graph's change log settings on roam.pub, where its owner can check it
  works, manage the token, and turn it off or back on. The extension warns once per session if Roam stopped accepting
  the token.
- New: While Roam is open, the extension confirms every few minutes that those blocks still exist (uids only), so
  roam.pub never writes to a deleted block, however many pages you've published.
- New: **Open** in a page's status toast goes to its status link when it's published in more than one place (its
  graph and collections), where you can copy each link and manage each place.

### Setup and settings
- New: **Dashboard** opens roam.pub at your API keys until you've added one, then at the dashboard. Paste the key into
  **API key**; the extension doesn't read your daily notes.
- New: **Author name**, shown as the byline where the graph or collection shows authors.
- New: **Sync published list** refreshes what the extension knows you've published, if a status looks wrong.
- New: The extension tells roam.pub which graph it's in, so an API key from another graph can't publish this graph's
  pages under the other graph's name. Publishing says which graph the key is for and how to get the right one.
- New: Encrypted graphs are supported. On a shared graph, pages another member published show their status only.
- New: Defaults to the `https://roam.pub` server (changeable under **Server URL**, which must use `https://`, so the
  key is never sent unencrypted).

### Docs
- New: README covers setup, usage, settings and what the extension reads, sends and stores.
