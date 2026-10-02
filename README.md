# Roam Publish

Publish Roam Research pages and blocks to the web as clean, shareable pages on [roam.pub](https://roam.pub).

> Roam Publish is a third-party service made by [@ejqs](https://ejqs.net). It is not affiliated with Roam Research.

This repo is the **Roam Depot extension**. It adds the publish commands to Roam and sends the page you choose to the
Roam Publish server. For how the extension and server fit together, see
[roam-publish-docs](https://github.com/ejqs/roam-publish-docs).

## Setup

1. Install **Roam Publish** from Roam Depot.
2. Sign up at [roam.pub](https://roam.pub) and connect your graph with an **append-only** API token
   (Roam: Settings → Graph → API tokens). Use a graph you own. roam.pub adds a block to today's daily note
   (`roam.pub connected this graph (safe to delete)`), which you can delete afterwards.
3. In Roam, open **Settings → Roam Publish** and click **Get API key**. Copy the key from the website and paste it into
   **API key**.

> [!WARNING]
> Verifying a graph may leave behind an `[[API Token: …]]` page in your graph that can't be deleted. Roam creates it
> for the token. It isn't caused by roam.pub. If you know how to remove it reliably, email ejqs [at] ejqs [dot] net.

**Shared graphs:** whoever connects a graph first owns it on roam.pub and invites others by email from the dashboard.
After you accept, you get your own key for that graph. Members can only change pages they published.

**Lost your key?** Regenerate it at [roam.pub/dashboard/keys](https://roam.pub/dashboard/keys) and paste the new one.
The old key stops working.

## Using it

| To | Do this |
| --- | --- |
| Publish a page | Right-click the page title → **Roam Publish: Publish page**, or run **Publish current page** from the command palette |
| Publish a block | Right-click the bullet → **Roam Publish: Publish block** |
| Update a published page or block | Publish it again. If nothing changed, you're told it's already published. |
| Make it public or unlisted | Right-click → **Make page/block public** or **unlisted** (shown for published items) |
| Take it down | Right-click → **Unpublish page/block** |

The link is copied to your clipboard when you publish.

**New pages are unlisted:** only people with the link can read them. **Making a page public** lists it on your graph's
front page and in its RSS feed, if the graph owner turned the feed on (`roam.pub/{graph}/feed.xml`). Feed readers may
keep a copy after you unpublish. Password-protected, members-only and unlisted pages are never in a feed.

Collections (`roam.pub/c/…`), passwords, members-only access, members and Discover are managed on the
[website dashboard](https://roam.pub/dashboard); the extension settings have an **Open dashboard** button.

### What gets published

The page or block and all its children, as text. Everything published is public to anyone with the link, so check
references, embeds and children first.

- **Block references** `((…))` become inline text, up to 3 levels deep. This includes blocks outside the published page.
- **Embeds** `{{embed: …}}` include the embedded block or page with its children, up to 2 levels deep.
- **`[[Links]]`** show as plain text, or as links if the linked page is also published.
- **Images, video, audio and PDFs** are sent as URLs only. The files aren't copied, and files in encrypted graphs won't
  display.

Nothing else from your graph is sent.

## Shortlink and change log

When you publish a **page**, the extension adds a block with its permanent link:

```
#published
  https://roam.pub/p/k3Xq9aZt
  Changelog
    [[October 2nd, 2026]] 14:03 Published as unlisted: https://roam.pub/…
```

The shortlink never changes, even if the page is renamed or moved to another collection. It's meant for you: you and
your graph's members see where the page lives, and everyone else is sent to the first place they can read it. To share
publicly, prefer the graph or collection links.

If you gave roam.pub an append-only token (during verification, or in the graph's settings on the website), it also
logs what happens to the page under **Changelog**: published, republished, made public or unlisted, added to a
collection, access changes, unpublished. This includes changes made on the website.

The shortlink block and everything under it are never published and never count as changes.

**Deleted the Changelog block?** roam.pub stops logging for that page and lists it on your dashboard. Publish the page
again to add the block back, or ignore it.

## Settings

| Setting | What it does |
| --- | --- |
| **API key** | Your key for this graph (see Setup). |
| **Author name** | Shown on pages when the graph or collection shows authors. Blank uses your @username. |
| **Add shortlink block** | On by default. Turn off for no shortlink block and no change log. |
| **Shortlink block on published blocks** | Off by default, so only pages get a shortlink block. Turn on to add one under published blocks too. |
| **Shortlink tag** | Written before the link. Default `#published`. Use e.g. `[[Roam Publish]]` or leave blank. Changing it edits existing blocks in place. |
| **Shortlink position** | `top` or `bottom` of the page. |
| **Check change log** | Asks roam.pub whether it can still write to the change log and when Roam last accepted an entry. Writes nothing. |
| **Sync published list** | Re-downloads the list of what you've published from the server. |
| **Server URL** | Advanced. Defaults to `https://roam.pub`. |

## Privacy and safety

- **Only on your action:** nothing leaves Roam until you publish a page or block. No analytics, and the only server
  contacted is roam.pub (or your configured Server URL).
- **One background request:** while Roam is open, about every 5 minutes, the extension tells roam.pub which Changelog
  blocks of your published pages still exist, sending uids only and no text. This prevents roam.pub from writing to a
  block you deleted. Turning off **Add shortlink block** stops it.
- **Written to your graph:** the shortlink block (when you publish), and change log entries if you stored an
  append-only token. Nothing else.
- **Stored in Roam's extension settings for this graph:** your API key, Author name, shortlink settings and a cache of
  what you've published. The key lets the server publish for you but gives no access to your Roam graph. The extension
  doesn't read your daily notes, so collaborators who can see them can't pick the key up.
- **Roam API token:** entered on the website, never in the extension. It can only add blocks. The server stores it
  encrypted and uses it only for the connection block and the change log. Remove it in the graph's settings on the
  website, or revoke it in Roam, to stop the change log.
- **Encrypted graphs** are supported.

## Known unknowns

- Images are published as links to Roam's hosting (typically Firebase Storage URLs). If Roam changes these or you
  delete the image, the published image breaks.
- Extension settings (including the API key) live in the graph. If collaborators on a shared graph see each other's
  settings, they'd share one key and author name. This hasn't been confirmed.

## Development

```bash
npm install
ROAM_PUBLISH_SERVER=http://localhost:3000 npm run dev   # rebuilds extension.js on change
npm run build       # production build
npm run typecheck
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.
