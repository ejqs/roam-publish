# Roam Publish

Publish Roam Research pages and blocks to the web as clean, shareable pages on [roam.pub](https://roam.pub).

**[See an example page →](https://roam.pub/ejqs/DyEQxo40V/roam-publish-kitchen-sink)**

- **Share it your way.** Keep a page unlisted so only people with the link can read it, list it on your graph's
  blog-style front page, or put it on [Discover](https://roam.pub/discover) for everyone on roam.pub to find.
- **Lock it down.** Protect a page with a password, or limit it to members of your graph.
- **Publish together.** Collections gather pages from different graphs and people in one place.

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

1. Right-click a page title or a bullet.
2. Choose **Roam Publish: Page…** or **Roam Publish: Block…**.
3. Click **Publish**. The link is copied to your clipboard.

On the website you also get these. Manage them from the [dashboard](https://roam.pub/dashboard), or click **Open
dashboard** in the extension settings.

- **Passwords and members-only pages** for anything you don't want fully open.
- **Collections** that gather pages from several graphs and people in one place, with their own members.
- **Discover**, where readers upvote pages and browse them by recent, trending (most viewed this week) or top.
- **Tags and search** on your graph's front page and in collections, plus site-wide search for verified accounts.
- **RSS feeds** for your graph, your collections and Discover.
- **Page history**: each page's permanent short link (`roam.pub/p/…`) shows your graph's members what happened to it
  and when. The same change log is also written back into your Roam page.
- **A public profile** at `roam.pub/u/{username}`.
- **Bulk changes**: select many pages to change where they're listed, who can read them, or their tags.

Open the same menu again to check whether it's published, or to **Republish** after edits, **Make public**,
**Make unlisted** or **Unpublish**.

You can also do all of this from the command palette: type "Roam Publish".

**Who can see it?** New pages are unlisted, so only people with the link can read them. Public pages are also listed
on your graph's front page and in its RSS feed, if the graph owner turned the feed on. Feed readers may keep a copy
after you unpublish.

### Supported blocks

The page or block is published with all its children. Everything published can be read by anyone with the link, so
check references, embeds and children first. Nothing else from your graph is sent.

- **Text formatting:** bold, italics, ^^highlights^^, ~~strikethrough~~, `inline code`, headings and text alignment.
- **Links:** `[[page links]]`, `#tags` and aliases. They link to the other page when it's also published, and show as
  plain text when it isn't.
- **Block references** `((…))`: shown as the referenced text, up to 3 levels deep, including blocks outside the
  published page.
- **Embeds** `{{embed: …}}`: the embedded block or page with its children, up to 2 levels deep.
- **Views:** bullets, numbered lists and document view.
- **Tables** `{{table}}` and **kanban boards** `{{kanban}}`.
- **Math** `$$…$$`, rendered with KaTeX.
- **Code blocks** with syntax highlighting.
- **Quotes** `>`, **attributes** `Key:: value`, **TODO / DONE** checkboxes (read-only) and **horizontal rules** `---`.
- **Images**, **video** (YouTube, Vimeo, Loom and video files), **audio**, **PDFs** and **iframes**.
- **Tweets** show as a link to the post.

### Unsupported blocks

- **Diagrams and drawings** (`{{mermaid}}`, `{{diagram}}`, `{{drawing}}`, Excalidraw) show a "Diagram not shown"
  placeholder.
- **Queries and mentions** (`{{query}}`, `{{mentions}}`) show a placeholder. Their results aren't published.
- **Interactive components** such as buttons, sliders, timers, counters and `roam/js` aren't shown.
- **Block references more than 3 levels deep** and **embeds more than 2 levels deep** are left out.
- **Files hosted in Roam** are linked, not copied. Files in encrypted graphs won't display.

## Settings

| Setting | What it does |
| --- | --- |
| **API key** | Your key for this graph (see Setup). |
| **Author name** | Shown on pages when the graph or collection shows authors. Blank uses your @username. |
| **Add Roam Publish block** | On by default. Off: nothing is written into your pages in Roam. roam.pub still keeps each page's status link and history on the website. |
| **Roam Publish block on published blocks** | Off by default, so only pages get one. Turn on to add one under published blocks too. |
| **Roam Publish block tag** | The block's text. Default `[[Roam Publish]]` (graphs set up before this keep `#published`). Blank for none. |
| **Status link text** | Shown for the link, as `[text](link)`. Default `Roam Publish Status`. Blank for the bare link. |
| **Roam Publish block position** | `top` or `bottom` of the page. |
| **Change log** | Opens the graph's change log settings on the website: whether it's on and working, its token, and turning it on or off. |
| **Dashboard** | Opens the roam.pub dashboard. |
| **Sync published list** | Re-downloads the list of what you've published from the server. |
| **Server URL** | Advanced. Defaults to `https://roam.pub`. |

Changing the tag or the link text edits existing blocks in place the next time you publish them.

## Privacy and safety

- **Only on your action:** nothing leaves Roam until you publish a page or block. No analytics, and the only server
  contacted is roam.pub (or your configured Server URL).
- **One background request:** while Roam is open, about every 5 minutes, the extension tells roam.pub which status link
  blocks still exist (uids only, no text). Turning off **Add Roam Publish block** stops it. See
  [Use of the Append API](#use-of-the-append-api).
- **Written to your graph:** the Roam Publish block when you publish, and change log entries if you kept an
  append-only token. Nothing else.
- **Stored in Roam's extension settings for this graph:** your API key, Author name, Roam Publish block settings and a cache of
  what you've published. The key lets the server publish for you but gives no access to your Roam graph. The extension
  doesn't read your daily notes, so collaborators who can see them can't pick the key up.
- **Roam API token:** entered on the website, never in the extension. See [Use of the Append API](#use-of-the-append-api).
- **Encrypted graphs** are supported.

### Use of the Append API

roam.pub writes to your graph with Roam's Append API and an **append-only** token you create in Roam. That kind of
token can only add blocks to its own graph. It can't read, edit, move or delete anything.

- **Verifying your graph, once:** roam.pub adds `roam.pub connected this graph (safe to delete)` to today's daily note.
  Only a graph's admins can create its tokens, so a successful write proves the graph is yours.
- **The change log, if you keep the token:** roam.pub adds a dated entry under a page's status link whenever
  something happens to it (published, made public, access changed, unpublished, and so on), including changes made
  on the website. Entries hold the date, time, what happened and links, never page content.
- **Your token:** entered on the website only, stored encrypted, never shown again. Pause the change log or remove the
  token in the graph's settings on roam.pub (**Change log → Open settings** in the extension), or revoke it in Roam.

The status link (`roam.pub/p/…`) shows you and your graph's members where a page is published. **Don't share it:**
anyone else is sent to the first place they can read the page, which can change.

For exactly what the extension reads, what it sends and how roam.pub uses the Append API, see
[Data flow and the Append API](https://github.com/ejqs/roam-publish-docs/blob/main/docs/data-and-append-api.md).

### Reporting a vulnerability

If you find a security issue in the extension or on roam.pub, please report it privately to
ejqs [at] ejqs [dot] net rather than opening a public issue. I'll reply as soon as I can.

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
