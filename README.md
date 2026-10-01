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

## Development

```bash
npm install
ROAM_PUBLISH_SERVER=http://localhost:3000 npm run dev   # rebuilds extension.js on change
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.
The server ↔ extension contract lives in the `roam-publish-web` repo docs.
