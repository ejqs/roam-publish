# Contributing

## Development

```bash
npm install
ROAM_PUBLISH_SERVER=http://localhost:3000 npm run dev   # rebuilds extension.js on change
npm run build       # production build
npm run typecheck
npm test            # serializer, hash parity with the server, encryption, API errors
```

In Roam: Settings → Roam Depot → enable Developer mode → load this folder.

## Releasing

CI runs the typecheck and Roam Depot's own `./build.sh` on every PR and push to `main`.

1. Check that `README.md` describes the release (see [README](#readme)).
2. On `develop`, rename `## Unreleased` in `CHANGELOG.md` to `## x.y.z (YYYY-MM-DD)` and set `version` in
   `package.json` (and the lock) to match.
3. Merge `develop` into `main`.
4. Push an annotated tag on `main`:

   ```
   git fetch origin
   git tag -a vx.y.z origin/main -m "Roam Publish x.y.z"
   git push origin vx.y.z
   ```

The Release workflow checks the tag, tests and builds, publishes the GitHub Release from that version's changelog
section, and opens "Roam Publish vx.y.z" on Roam-Research/roam-depot pinning the commit. Don't open or edit that PR
by hand. While it's open, more changes join the same version: merge them into `main` and move the tag.

## README

`README.md` is what Roam Depot shows people before they install, so it has to match the release Roam Depot will
serve. Before every release (and before moving a release tag), check that new or changed features, settings and
privacy behavior are in it, and retake any screenshot that no longer matches.

- Main features only, one short section each. Detail goes in the
  [extension guide](https://github.com/ejqs/roam-publish-docs/blob/main/docs/extension-guide.md).
- Screenshots live in `docs/readme/`, about 1200 px wide, light mode, from a real Roam graph. The README links them
  with absolute `raw.githubusercontent.com/ejqs/roam-publish/main/...` URLs, because Roam Depot shows the README
  outside GitHub; links to repo files are absolute for the same reason.
- Say "access and visibility controls", never "who can see it" or "who can read it".
