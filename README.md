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
| Publish a page or block | Right-click the page title or bullet → **Roam Publish: Page…** / **Block…** → **Publish**. Or run **Publish current page** / **Publish focused block** from the command palette. |
| See if it's published | **Roam Publish: Page…** / **Block…** (or **Current page status** / **Focused block status**): not published, published and up to date, or changed since it was published |
| Update, make public or unlisted, take down | From the same message: **Republish** (when it changed), **Make public** / **Make unlisted**, **Unpublish**. Or run **Unpublish current page** / **Unpublish focused block**. |

Page commands act on the page you have open, also when you're zoomed into one of its blocks.

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

## Status link and change log

When you publish a **page**, the extension adds a Roam Publish block with the page's status link:

```
[[Roam Publish]]
  [Roam Publish Status](https://roam.pub/p/k3Xq9aZt)
    [[October 2nd, 2026]] 14:03 Published as unlisted: https://roam.pub/…
```

The status link never changes, even if the page is renamed or moved to another collection. It's meant for you and
your graph's members: it shows where the page is published. **Don't share it:** anyone else who opens it is sent to the
first place they can read the page, which can change. To share the page, use its graph or collection link.

If you gave roam.pub an append-only token (during verification, or in the graph's settings on the website), it also
logs what happens to the page under the status link: published, republished, made public or unlisted, added to a
collection, access changes, unpublished. This includes changes made on the website. The graph's owner can turn the
change log off and on in the graph's settings on the website (**Change log → Open settings** in the extension's
settings goes there). Off keeps the token; changes made meanwhile aren't logged.

The Roam Publish block and everything under it are never published and never count as changes. Pages published with
earlier versions have a separate **Changelog** block; it keeps its entries, and new ones go under the status link.

**Deleted the status link?** roam.pub stops logging for that page and lists it on your dashboard. Publish the page
again to add it back, or ignore it.

## Settings

| Setting | What it does |
| --- | --- |
| **API key** | Your key for this graph (see Setup). |
| **Author name** | Shown on pages when the graph or collection shows authors. Blank uses your @username. |
| **Add Roam Publish block** | On by default. Turn off for no status link and no change log. |
| **Roam Publish block on published blocks** | Off by default, so only pages get one. Turn on to add one under published blocks too. |
| **Roam Publish block tag** | The block's text. Default `[[Roam Publish]]` (graphs set up before this keep `#published`). Blank for none. |
| **Status link text** | Shown for the link, as `[text](link)`. Default `Roam Publish Status`. Blank for the bare link. |
| **Roam Publish block position** | `top` or `bottom` of the page. |

Changing the tag or the link text edits existing blocks in place the next time you publish them.
| **Change log** | Opens the graph's change log settings on the website: whether it's on and working, its token, and turning it on or off. |
| **Sync published list** | Re-downloads the list of what you've published from the server. |
| **Server URL** | Advanced. Defaults to `https://roam.pub`. |

## Privacy and safety

- **Only on your action:** nothing leaves Roam until you publish a page or block. No analytics, and the only server
  contacted is roam.pub (or your configured Server URL).
- **One background request:** while Roam is open, about every 5 minutes, the extension tells roam.pub which status link
  blocks of your published pages still exist, sending uids only and no text. This prevents roam.pub from writing to a
  block you deleted. Turning off **Add Roam Publish block** stops it.
- **Written to your graph:** the Roam Publish block (when you publish), and change log entries if you stored an
  append-only token. Nothing else.
- **Stored in Roam's extension settings for this graph:** your API key, Author name, Roam Publish block settings and a cache of
  what you've published. The key lets the server publish for you but gives no access to your Roam graph. The extension
  doesn't read your daily notes, so collaborators who can see them can't pick the key up.
- **Roam API token:** entered on the website, never in the extension. It can only add blocks. The server stores it
  encrypted and uses it only for the connection block and the change log. Remove it in the graph's settings on the
  website, or revoke it in Roam, to stop the change log, or turn the change log off there to pause it.
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

### Releasing

CI runs the typecheck and Roam Depot's own `./build.sh` on every PR and push to `main`. To release: update `version` in
`package.json` and add a matching `## x.y.z` section to `CHANGELOG.md`, then push a tag (`git tag v0.1.1 && git push
origin v0.1.1`). The Release workflow publishes a GitHub Release with that changelog section. Then bump `source_commit`
in your roam-depot PR to the released commit.

## License

[MIT](LICENSE)
