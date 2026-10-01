# Roam Publish

Publish Roam Research pages and blocks to the web as clean, public pages.

> Roam Publish is a third-party service made by [@ejqs](https://ejqs.net). It is not affiliated with Roam Research.

## Setup

1. Install **Roam Publish** from Roam Depot.
2. Open **Settings → Roam Publish** and click **Log in to Roam Publish**.
3. Sign up or log in on the website, then enter your graph name and a temporary **append-only** API token
   (Roam: Settings → Graph → API tokens).
4. The server adds a block like `verify-roam-publish (deletable after onboarding): …` to today's daily note.
   The extension picks it up and fills in your API key automatically. If it doesn't, click **Finish setup**.
5. You can now delete the verification block and the append-only token.

## Usage

- Right-click a **block bullet** → *Roam Publish: Publish block*
- Right-click a **page title** → *Roam Publish: Publish page*
- Command palette → *Roam Publish: Publish current page*

The public link is copied to your clipboard. Publishing again with no changes tells you it's already published;
publishing after edits updates the live page. To see everything you've published, click **Open dashboard** in the extension settings.

## What gets published

The page or block and all of its children. Block references are inlined as text, and `[[links]]` show as plain
text, or as links when the linked page is also published. Nothing else from your graph is sent.

## Safety

What the extension reads, sends, and stores:

- **Only on your action.** Nothing leaves Roam until you choose to publish a page or block. There is no background
  upload of your graph.
- **What is sent:** the published page or block, its children, and the page title, as text (`uid`, `string`,
  heading level, nesting). Block references (`((uid))`) are resolved to their text, up to 3 levels deep, so
  referenced blocks outside the published tree are included as inline text. Images are sent as their URL
  only; the image files are not copied.
- **Everything published is public.** Anyone with the link can read it. Check block references and children
  before publishing.
- **Where it goes:** only to the Roam Publish server (`https://roam.pub`, or the server URL set in settings).
  The extension makes no other network requests and has no analytics.
- **What is stored locally:** your Roam Publish API key and a cache of what you've published, both in Roam's
  extension settings for this graph. The key lets the server publish on your behalf; it does not give access to
  your Roam graph.
- **Roam API token:** the temporary append-only token is entered on the website, not in the extension. It can only
  add blocks (used to write the verification block), cannot read your graph, and you can delete it after onboarding.
- **Verification block:** during setup the extension reads today's daily note (and the days either side) for blocks
  containing `verify-roam-publish`, and nothing else on those pages is sent. Codes are single-use and expire.
- **Encrypted graphs:** supported. The verification block is written with the Append API like any other graph.

## To Confirm

Things I haven't verified yet:

- **Do Roam image URLs ever change?** Images are published as links to wherever Roam hosts them (typically
  Firebase Storage download URLs with a long-lived token), so published pages depend on those URLs staying live.
  They should be stable unless the image is deleted, the token is revoked, Roam changes its storage, or the graph is
  encrypted, but I haven't confirmed this. If it turns out they break, the extension would need to re-host
  images at publish time.

## Development

```bash
npm install
ROAM_PUBLISH_SERVER=http://localhost:3000 npm run dev   # rebuilds extension.js on change
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.
The server ↔ extension contract lives in the `roam-publish-web` repo docs.
