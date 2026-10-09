# Roam Publish

Publish Roam Research pages and blocks to the web as clean, shareable pages on [roam.pub](https://roam.pub).

**[See an example page →](https://roam.pub/ejqs/DyEQxo40V/roam-publish-kitchen-sink)**

- **Share it your way.** Every page has a **Visibility**: **Unlisted** so only people with the link can read it,
  **Public** on your graph's blog-style front page, or **Discover** on [Discover](https://roam.pub/discover) for
  everyone on roam.pub to find. (The extension's buttons still call Public "listed" and Discover "discoverable".)
- **Lock it down.** Make a page **Password** or **Members**. Password pages can also be encrypted, and from
  Roam Publish 0.2.0 they're encrypted in Roam before they're sent, so roam.pub never sees their text or title.
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
3. In Roam, open **Settings → Roam Publish** and click **Open dashboard**, which opens your API keys. Copy the key from the website and paste it into
   **API key**.

> [!WARNING]
> Verifying a graph may leave behind an `[[API Token: …]]` page in your graph that can't be deleted. Roam creates it
> for the token. It isn't caused by roam.pub. If you know how to remove it reliably, email support@roam.pub.

**Shared graphs:** whoever connects a graph first owns it on roam.pub and invites others by email from the dashboard.
After you accept, you get your own key for that graph. Members can only change pages they published.

**One key per graph.** A key only works in the graph it was made for. Pasted into another graph, publishing says
which graph it belongs to, and nothing is published.

**Lost your key?** Regenerate it at [roam.pub/dashboard/keys](https://roam.pub/dashboard/keys) and paste the new one.
The old key stops working.

## Using it

1. Right-click a page title or a bullet.
2. Choose **Roam Publish: Page…** or **Roam Publish: Block…**.
3. Click **Publish**. The link is copied to your clipboard.

**On roam.pub** you also get these. Manage them from the [dashboard](https://roam.pub/dashboard), or click **Open
dashboard** in the extension settings.

- **Who can read it:** Unlisted, Public or Discover, or lock it with a **Password** or to **Members**. Password pages
  can be end-to-end encrypted, title included.
- **Collections** that gather pages from several graphs and people, with their own members and settings.
- **Discover**, where readers find and upvote pages and collections.
- **Front pages** for your graph and collections, as cards or folders, with tags, search and RSS.
- **Reading tools:** readers fold blocks, zoom into one and follow an outline, as in Roam, and can download a page as
  a **PDF** when you turn it on.
- **Pinned links:** pin a link you've shared, and roam.pub won't unpublish or lock that page while it's pinned.
- **Link previews** with the page's title and opening lines when you share it in chat apps and social posts.
- **Page history** on each page's status link, also written back into your Roam page.
- **What's new** at [roam.pub/updates](https://roam.pub/updates), with this extension's release notes.

New pages and blocks are published **Unlisted**: only people with the link can see them. The toast offers **Make
listed** and **Make discoverable** right away, and **Add to collection…** when you're in a collection.

**Add to collection…** lists your collections and how the page starts out in each one, using that collection's own
defaults (listed, on Discover, password-protected or members only). When the collection is password-protected or
members only and the page is more open in your graph, or the collection takes the pages added to it out of their
graph, adding it takes it out of your graph, so the graph link can't get around the collection's lock. Encrypted pages
can be added too, with no password to type: Roam Publish adds the page and republishes it, so it opens in the
collection with the collection's password. Collections without a password that can encrypt are greyed out.

**Collapsed blocks.** The first time you publish a page with collapsed blocks, Roam Publish asks whether to publish
it as is (those blocks start collapsed) or expanded. Readers can open and close blocks either way. Later, when the
blocks collapsed in Roam aren't the ones collapsed on the published page, republishing asks: **Republish as is**, or
**Republish, keep open/collapsed** to update the content and leave the published page's blocks as they are. If only
which blocks are collapsed changed, the status toast offers **Sync open/collapsed blocks** instead.

Open the same menu again to check whether it's published and where it's listed, or to **Republish** after edits,
change where it's listed (**Make listed**, **Make discoverable**, **Make unlisted**), **Add to collection…**, or
**Unpublish**. A page that's only in collections has no graph listing to change, so the toast says each of its
collections sets how it's listed. A page can only be Discoverable when it's open to everyone, shown in your graph,
and your graph's front page and search engines are on; otherwise the toast says what's stopping it. Unpublishing asks first: it deletes the page on roam.pub along with
its access settings, passwords, views, upvotes and places in collections. On a shared graph, pages another member
published show their status only; only they or the graph's owner can change them.

You can also do all of this from the command palette: type "Roam Publish".

**Keeping up to date.** When roam.pub changes in a way that needs a newer Roam Publish, the extension says so once and
tells you where to update it (Settings → Roam Depot → Installed extensions), instead of failing with a confusing
error.

### Supported blocks

The page or block is published with all its children. Everything published can be read by anyone with the link, so
check references, embeds and children first. Nothing else from your graph is sent.

- **Text formatting:** bold, italics, ^^highlights^^, ~~strikethrough~~, `inline code`, headings and text alignment.
- **Links:** `[[page links]]`, `#tags` and aliases. They link to the other page when it's also published and listed,
  and show as plain text when it isn't (so an unlisted page's link is never handed out).
- **Collapsing and zooming:** readers fold any block with children, fold a whole page from its thread line, and
  click a bullet or number to zoom into a block, as in Roam. Pages with headings get an outline.
- **Block references** `((…))`: shown as the referenced text, up to 3 levels deep, including blocks outside the
  published page.
- **Embeds** `{{embed: …}}`: the embedded block or page with its children, up to 2 levels deep, and every embed when
  a block has several.
- **Views:** bullets, numbered lists and document view.
- **Tables** `{{table}}` and **kanban boards** `{{kanban}}`.
- **Math** `$$…$$`, rendered with KaTeX.
- **Code blocks** with syntax highlighting, a language label and a copy button. Click inline code to copy it.
- **Mermaid diagrams** (`{{mermaid}}`, or a code block set to Mermaid) are drawn, with a button to see the source.
- **Quotes** `>`, **attributes** `Key:: value`, **TODO / DONE** checkboxes (read-only) and **horizontal rules** `---`.
- **Images**, **video** (YouTube, Vimeo, Loom and video files), **audio**, **PDFs** and **iframes**.
- **Tweets** show as a link to the post.

### Unsupported blocks

- **Diagrams and drawings** other than Mermaid (`{{diagram}}`, `{{drawing}}`, Excalidraw) show a "Diagram not shown"
  placeholder.
- **Queries and mentions** (`{{query}}`, `{{mentions}}`) show a placeholder. Their results aren't published.
- **Interactive components** such as buttons, sliders, timers, counters and `roam/js` aren't shown.
- **Block references more than 3 levels deep** and **embeds more than 2 levels deep** are left out.
- **Files hosted in Roam** are linked, not copied. Files in encrypted graphs won't display.

## Settings

| Setting | What it does |
| --- | --- |
| **Dashboard** | Opens the roam.pub dashboard, at your API keys until you've added one. |
| **API key** | Your key for this graph (see Setup). |
| **Author name** | Shown on your pages when authors are shown. Blank: your @username. |
| **Add Roam Publish block when publishing pages** | On by default. Off: nothing is written into your pages. roam.pub still keeps each page's status link and history. |
| **Add Roam Publish block when publishing blocks** | Off by default. On: the same, under each block you publish. Separate from the pages setting. |
| **Block tag** | The block's text. Default `[[Roam Publish]]` (graphs set up before this keep `#published`). Blank: no tag. |
| **Status link text** | Written as `[text](link)`. Default `Roam Publish Status`. Blank: bare link. |
| **Block position** | First or last on the page, or under the block. |
| **Change log** | On roam.pub: turn it on or off, check it works, and manage its token. |
| **Sync published list** | Updates the extension's list of what you've published from roam.pub. Use it if a status looks wrong, e.g. after unpublishing on the website. The **Page…** and **Block…** menus already do this. |
| **Server URL** | Advanced. Defaults to `https://roam.pub`. Must use `https://` (or `http://localhost` for development), so your key is never sent unencrypted. |
| **Reset Roam Publish block settings** | Restores the defaults of the Roam Publish block settings. Reinstalling doesn't, since Roam keeps settings. |

Changing the tag or the link text edits existing blocks in place the next time you publish them.

## Privacy and safety

- **Only on your action:** nothing leaves Roam until you publish a page or block. No analytics, and the only server
  contacted is roam.pub (or your configured Server URL).
- **One background request:** while Roam is open, about every 5 minutes, the extension tells roam.pub which status link
  blocks still exist (uids only, no text). Turning off **Add Roam Publish block when publishing pages** (and **…blocks**) stops it. See
  [Use of the Append API](#use-of-the-append-api).
- **Written to your graph:** the Roam Publish block when you publish, and change log entries if you kept an
  append-only token. Nothing else.
- **Encrypted graphs** are supported. The extension only sends the data you choose to publish.
- **Encrypted pages:** a Password page that roam.pub encrypts is encrypted in Roam before it's sent (from 0.2.0), so
  roam.pub only gets the encrypted page and never sees its text or title (it calls it "Encrypted page"). The
  extension asks roam.pub for the passwords' public keys first; it never sees a password. Readers' browsers decrypt
  the page with the password. This needs a Roam recent enough to have X25519 encryption; on an older one, the page
  is sent as before, roam.pub encrypts it when it arrives, and the publish message says so. Each encrypted page says which way it was encrypted: see
  [Encryption versions](https://roam.pub/privacy/encryption/versions).
- **Your extension's version** is sent with every request, so roam.pub knows which versions are still in use before
  it retires anything older ones rely on.

### Use of the Append API

roam.pub writes to your graph with Roam's Append API and an **append-only** token you create in Roam. That kind of
token can only add blocks to its own graph. It can't read, edit, move or delete anything.

- **Verifying your graph, once:** roam.pub adds `roam.pub connected this graph (safe to delete)` to today's daily note.
  Only a graph's admins can create its tokens, so a successful write proves the graph is yours.
- **The change log, if you keep the token:** roam.pub adds a dated entry under a page's status link whenever
  something happens to it (published, listed, access changed, unpublished, and so on), including changes made
  on the website. Entries hold the date, time, what happened and links, never page content.
- **Your token:** entered on the website only, stored encrypted, never shown again. Pause the change log or remove the
  token in the graph's settings on roam.pub (**Change log → Open settings** in the extension), or revoke it in Roam.

The status link (`roam.pub/p/…`) shows you and your graph's members where a page is published. **Don't share it:**
anyone else is asked to log in or gets a "not found" page. Share the page's graph or collection link instead.

For exactly what the extension reads, what it sends and how roam.pub uses the Append API, see
[Data flow and the Append API](https://github.com/ejqs/roam-publish-docs/blob/main/docs/data-and-append-api.md).
roam.pub's [Privacy policy](https://roam.pub/privacy) and [Terms](https://roam.pub/terms) cover the website and the
extension.

### Reporting a vulnerability

If you find a security issue in the extension or on roam.pub, please report it privately to
support@roam.pub or ejqs [at] ejqs [dot] net rather than opening a public issue. I'll reply as soon as I can.

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
npm test            # serializer, hash parity with the server, encryption, API errors
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.

### Releasing

CI runs the typecheck and Roam Depot's own `./build.sh` on every PR and push to `main`. To release: update `version` in
`package.json` and add a matching `## x.y.z` section to `CHANGELOG.md`, then push a tag (`git tag v0.1.1 && git push
origin v0.1.1`). The Release workflow publishes a GitHub Release with that changelog section. Then bump `source_commit`
in your roam-depot PR to the released commit.

## License

[MIT](LICENSE)
