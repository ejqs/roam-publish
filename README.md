# Roam Publish

Publish Roam Research pages and blocks to the web as clean, public pages.

> Roam Publish is a third-party service made by [@ejqs](https://ejqs.net). It is not affiliated with Roam Research.

For how the extension and the server work together (the contract, shared invariants, trust boundary, and how to ship
changes across both), see [roam-publish-docs](https://github.com/ejqs/roam-publish-docs).

## Setup

1. Install **Roam Publish** from Roam Depot.
2. Sign up at [roam.pub](https://roam.pub) and connect your **personal graph** (one you own) with a temporary
   **append-only** API token (Roam: Settings → Graph → API tokens). The server adds a block like
   `roam.pub connected this graph (safe to delete)` to today's daily note; you can delete it and the token right after.

   > [!WARNING]
   > Delete the token in this exact order, or its **API Token: …** page (the token's display name) can never be
   > deleted:
   > 1. **Click** the token's link under *Roam Page Title* in Settings → Graph → API tokens
   >    (e.g. `[[API Token: Roam Publish]]`) to open its page.
   > 2. **Delete** that page: ⋯ menu (top right) → *Delete Page*.
   > 3. **Revoke** the token: back in API tokens, click the ✕ next to it.
3. Click **Get API key** on the website (or in Roam: Settings → Roam Publish → Get API key), copy the key, and paste
   it into **Settings → Roam Publish → API key**.

**Shared graphs:** whoever connects a graph first owns it on roam.pub. The owner invites everyone else by email from
the dashboard; once you accept, you get your own key for that graph. Invites only go to accounts with a verified
email and a connected graph of their own.

**Lost your key?** Regenerate it at roam.pub/dashboard/keys and paste the new one. The old key stops working.

## Usage

- Right-click a **block bullet** → *Roam Publish: Publish block*
- Right-click a **page title** → *Roam Publish: Publish page*
- Command palette → *Roam Publish: Publish current page*

The public link is copied to your clipboard. Publishing again with no changes tells you it's already published;
publishing after edits updates the live page. To see everything you've published, click **Open dashboard** in the extension settings.

Set **Author name** in the extension settings to sign the pages you publish. It shows where the graph or collection
shows authors; left blank, your public @username is used.

Who can read a page (open, password, members only), collections (`roam.pub/c/…`), members, Discover and RSS feeds
are all managed on the website. In a shared graph, members can only change the pages they published.

## What gets published

The page or block and all of its children. Block references are inlined as text, embeds (`{{embed: …}}`) include
the embedded block or page with its children, and `[[links]]` show as plain text, or as links when the linked page
is also published. Nothing else from your graph is sent.

## Safety

What the extension reads, sends, and stores:

- **Only on your action.** Nothing leaves Roam until you choose to publish a page or block. There is no background
  upload of your graph.
- **What is sent:** the published page or block, its children, and the page title, as text (`uid`, `string`,
  heading level, nesting, numbered/document view, text alignment). Block references (`((uid))`) are resolved to
  their text, up to 3 levels deep, so referenced blocks outside the published tree are included as inline text.
  Embedded blocks and pages are included with all their children, up to 2 embeds deep. Images, video, audio and
  PDFs are sent as their URL only; the files are not copied, and files in encrypted graphs won't display.
- **Everything published is public.** Anyone with the link can read it. Check block references, embeds and
  children before publishing.
- **Making a page public lists it.** A public page shows on the graph's front page, and, if the graph owner turned
  on the graph's RSS feed (`roam.pub/{graph}/feed.xml`), its title and the start of its text go out to feed readers,
  who may keep a copy after you unpublish. Unlisted and password- or members-only pages are never in a feed.
- **Where it goes:** only to the Roam Publish server (`https://roam.pub`, or the server URL set in settings).
  The extension makes no other network requests and has no analytics.
- **What is stored locally:** your Roam Publish API key, your Author name and a cache of what you've published, all
  in Roam's extension settings for this graph. The key lets the server publish on your behalf; it does not give
  access to your Roam graph. Each person in a shared graph has their own key, and the owner can revoke a member's.
- **Roam API token:** the temporary append-only token is entered on the website, not in the extension. It can only
  add blocks (used once to write the connection block), cannot read your graph, and you can delete it after setup.
- **No setup reading:** the extension doesn't read your daily notes to finish setup; you paste the key yourself, so
  collaborators who can see your daily notes can't pick it up.
- **Encrypted graphs:** supported. The connection block is written with the Append API like any other graph.

## To Confirm

Things I haven't verified yet:

- **Do Roam image URLs ever change?** Images are published as links to wherever Roam hosts them (typically
  Firebase Storage download URLs with a long-lived token), so published pages depend on those URLs staying live.
  They should be stable unless the image is deleted, the token is revoked, Roam changes its storage, or the graph is
  encrypted, but I haven't confirmed this. If it turns out they break, the extension would need to re-host
  images at publish time.
- **Are extension settings per person in a shared graph?** The API key, Author name and published-list cache are
  stored with Roam Depot's extension settings, which live in the graph. If collaborators on a multiplayer graph see
  each other's values, they would share one key and author name; the fix would be to keep these in the browser's
  local storage, keyed by graph, instead.

## Development

```bash
npm install
ROAM_PUBLISH_SERVER=http://localhost:3000 npm run dev   # rebuilds extension.js on change
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.
The server ↔ extension contract lives in the `roam-publish-web` repo docs; how the two fit together is explained in
[roam-publish-docs](https://github.com/ejqs/roam-publish-docs).
