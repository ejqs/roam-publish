# Changelog

All notable changes to the Roam Publish extension. Each version is dated when it was sent to Roam Depot; roam.pub's
What's new shows it once Roam Depot serves it. Every bullet starts with **Breaking:**, **New:**, **Improved:** or
**Fixed:**; a breaking change comes with a new major version.

## 0.3.0 (2026-10-26)

### Status in Roam
- New: **A published page shows its status after its title.** A globe icon, or a lock when it's encrypted: green
  when it's up to date, orange with a dot when it changed since you last published it. Hover it for the status;
  click it for the same actions as **Roam Publish: Page…**.
- New: A block published on its own gets a ring on its bullet, green or orange the same way.
- New: Blocks edited since their page or block was last published get a bar beside them, so you can see what a
  Republish would change.
- New: **Status in Roam** setting: **Titles and blocks** (the default), **Titles only** or **Off**. Nothing is written
  to your graph to show any of this.

### Settings and dashboard
- New: **Settings** in the title icon's pop-up: where the page is listed, its byline, view count and Download PDF,
  in your graph and in each of its collections, and **Remove** to take it out of a collection. Access and passwords
  are still changed on roam.pub.
- New: **Collection settings** from Roam, for a collection's owner: name, description, bylines, view counts,
  Download PDF, Discover, search and RSS. Members see them without changing them.
- New: **A Roam Publish dashboard in Roam**, from a globe in the top bar or **Roam Publish: Open dashboard**: views
  per day, upvotes, readers' countries, your most read pages, what changed since you published it, with
  Republish, and your collections, for the last 7 or 30 days or all time.

### Publishing
- New: **Publish to.** Publishing something new asks where it goes: your graph, your graph encrypted, or one of
  your collections, each with how the page starts out there. It starts on roam.pub's **New pages go to**, so one
  click on **Publish** keeps the usual place. A collection picked is the only place the page goes.
- Improved: **Publish with encryption** is one of the **Publish to** choices. Without a graph password that can
  encrypt, the choice is greyed out.

### Setup and settings
- New: **Top bar button** setting, on by default: the globe that opens the dashboard.
- New: **Ask where to publish** setting, on by default. Off: Publish goes straight to where **New pages go to**
  says, and the status pop-up offers **Publish with encryption** next to Publish.

## 0.2.0 (2026-10-13)

### Security
- New: **Password pages are encrypted in Roam before they're published, title included.** roam.pub only gets the
  encrypted page and never sees its text or title, not even while publishing; it calls it "Encrypted page", and
  readers' browsers decrypt it with the password. Needs a Roam (browser or desktop app) recent enough to have X25519
  encryption; on an older one, pages are published as before and roam.pub encrypts them, and the publish message
  says so.

### Publishing
- Improved: The extension uses roam.pub's words for a page's visibility. The buttons are **Make public**, **Put on
  Discover** and **Make unlisted** (they were Make listed and Make discoverable), and the status says "Public page"
  or "Page on Discover".
- New: **Publish with encryption.** The status pop-up for a page or block that isn't published yet has a **Publish
  with encryption** button next to Publish, and the command palette has **Roam Publish: Publish current page with
  encryption** and **Publish focused block with encryption**. It publishes to your graph as a Password page,
  encrypted in Roam with your graph password, whatever new pages usually start as. If your graph has no password
  that can encrypt yet, nothing is published and the message says how to set one on roam.pub.
- New: Pages with collapsed blocks are published with those blocks collapsed, as you have them in Roam. To publish
  them expanded instead, set **Collapsed blocks** to **Expanded** in the extension settings. Readers can open and
  close blocks either way.
- New: Republishing keeps the published page's open and collapsed blocks. Collapsing or expanding blocks in Roam
  alone doesn't make a page show as changed; instead the status toast offers **Sync open/collapsed blocks**. roam.pub
  remembers which blocks it has collapsed, so this works from any computer.
- Improved: The status toast offers one action: **Republish** when the page changed, **Sync open/collapsed blocks**
  when only collapsed blocks differ, or none when it's up to date, then **Add to collection…** and **Unpublish**.
  Visibility is changed on roam.pub, from the page **Open** goes to; the toast after a first publish still offers
  **Make public** and **Put on Discover**.
- Fixed: For a page that's only in collections, the status toast offered **Make listed** and **Make unlisted**,
  which did nothing, and called it unlisted. It now says the page is only in collections.
- Improved: The status toast is shorter and says when a page is encrypted, for example "Encrypted unlisted page, up
  to date. Last published Oct 8, 2026, 1:14 PM."
- New: **Add to collection…** works for encrypted pages too, with no password to type. Roam Publish adds the page
  and republishes it, so it opens in the collection with the collection's password. If the page changed in Roam since
  you last published it, it asks first. Collections without a password that can encrypt are greyed out.

### Setup and settings
- New: **Collapsed blocks** setting: **As in Roam** (the default) or **Expanded**, for how blocks collapsed in Roam
  start out the first time you publish.
- Improved: The extension's description lists roam.pub's main features, including end-to-end encryption and
  Download as PDF, in fewer words.
- New: When roam.pub changes in a way that needs a newer Roam Publish, the extension says so and tells you where to
  update it, instead of failing with a confusing error.
- Improved: **Fewer settings.** Change log, Sync published list, Status link text, Server URL and Reset Roam Publish
  block settings are gone. The change log is managed from **Open dashboard**, the **Page…** and **Block…** menus
  already sync, and the status link always reads "Roam Publish Status" (a link with other text gets it the next time
  you publish that page). Your other choices carry over.
- New: Pasting an **API key** checks it at once: the extension says which graph it works for, or what's wrong.
- Improved: **Roam Publish block** is one setting: **Pages**, **Pages and blocks**, **Blocks only** or **Off**. It
  replaces the two switches. **Block position** reads **First** or **Last**.

## 0.1.1 (2026-10-07)

### Publishing
- Fixed: Publishing and syncing no longer fail with "transaction failed: Data returned contains undefined" when a
  page has no author name saved with it.

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
- New: **Unpublish** from the command palette checks the page first: one that isn't published, or that another
  member published, says so instead of asking you to confirm something that can't happen.
- New: Every Roam Publish toast has a **Close** button, and toasts stay open while your pointer or keyboard focus is
  in them.
- New: **Add to collection…** on the publish and status toasts puts a page in one of your collections, from a
  dropdown that says how it starts out in each one (listed, on Discover, password-protected or members only). When
  the collection is locked and your graph isn't, the page moves out of your graph so its graph link can't get
  around the lock.
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
- New: **Reset Roam Publish block settings** asks before replacing your tag, link text and position.
- New: Without an API key, the Page… and Block… menus say to add one, instead of showing an old status with buttons
  that can't work.

### Docs
- New: README covers setup, usage, settings and what the extension reads, sends and stores.
