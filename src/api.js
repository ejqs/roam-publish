import {
  normalizeGroupIds,
  teamDestinationFor,
  teamDestinationsFor,
  teamNameFor,
  teamNamesFor,
} from "./groups.js";
import { getApiKey } from "./settings-store.js";
import {
  contentFingerprintFor,
  entityKindFromPull,
  entityTitleFromPull,
  isPageEntity,
  pullEntity,
  refreshCachedOpenUid,
} from "./roam.js";

/**
 * Dummy network client. Real server calls land here later.
 * Always attach API key when present (log only in dummy mode).
 */

function withAuthNote(label) {
  const key = getApiKey();
  if (key) {
    console.log(`Roam Publish: ${label} (dummy) with API key (${key.length} chars)`);
  } else {
    console.log(`Roam Publish: ${label} (dummy, no API key)`);
  }
  return key ? { Authorization: `Bearer ${key}` } : {};
}

/** Enrich entry with multi-team fields (+ legacy single mirrors). */
function withTeamFields(record) {
  const groupIds = normalizeGroupIds(
    record.groupIds ?? record.teamIds ?? record.groupId ?? record.teamId,
  );
  const groupNames = teamNamesFor(groupIds);
  const teamDestinations = teamDestinationsFor(groupIds);
  const groupId = groupIds[0] || null;
  return {
    ...record,
    groupIds,
    groupNames,
    teamDestinations,
    groupId,
    groupName: groupNames[0] || teamNameFor(groupId),
    teamDestination: teamDestinations[0] || teamDestinationFor(groupId),
  };
}

/** @returns {Promise<{ ok: boolean, fetchedAt: string, items: Array<object> }>} */
export async function fetchPublishedIndex() {
  withAuthNote("fetching publish index");
  await new Promise((r) => setTimeout(r, 200));

  /** @type {Array<object>} */
  const items = [
    {
      uid: "dummy-page-alpha",
      kind: "page",
      status: "published",
      visibility: "public",
      groupIds: ["team-personal-blog"],
      title: "Dummy Alpha",
      url: "https://example.com/p/dummy-page-alpha",
      publishedAt: "2026-09-01T10:00:00Z",
    },
    {
      uid: "dummy-block-beta",
      kind: "block",
      status: "outdated",
      scope: "tree",
      visibility: "unlisted",
      groupIds: ["team-work-docs"],
      title: "Dummy block that drifted",
      url: "https://example.com/b/dummy-block-beta",
      publishedAt: "2026-08-15T18:30:00Z",
    },
    {
      uid: "dummy-page-gamma",
      kind: "page",
      status: "draft",
      visibility: "private",
      groupIds: ["team-personal-blog", "team-work-docs"],
      title: "Dummy draft (not live)",
    },
  ];

  const seen = new Set(items.map((i) => i.uid));
  const openUid = await refreshCachedOpenUid();
  if (openUid && !seen.has(openUid)) {
    const pull = pullEntity(openUid);
    items.push({
      uid: openUid,
      kind: entityKindFromPull(pull) || "page",
      status: "published",
      scope: "self",
      visibility: "unlisted",
      groupIds: ["team-personal-blog"],
      title: entityTitleFromPull(pull, openUid),
      url: `https://example.com/demo/${openUid}`,
      publishedAt: new Date().toISOString(),
      contentFingerprint: contentFingerprintFor(openUid),
    });
    seen.add(openUid);
  }

  const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
  if (focusedUid && !seen.has(focusedUid)) {
    const pull = pullEntity(focusedUid);
    if (pull && !isPageEntity(pull)) {
      items.push({
        uid: focusedUid,
        kind: "block",
        status: "published",
        scope: "self",
        visibility: "private",
        groupIds: ["team-work-docs"],
        title: entityTitleFromPull(pull, focusedUid),
        url: `https://example.com/demo/${focusedUid}`,
        publishedAt: new Date().toISOString(),
        contentFingerprint: contentFingerprintFor(focusedUid),
      });
    }
  }

  for (const item of items) {
    Object.assign(item, withTeamFields(item));
    if (!item.contentFingerprint) {
      item.contentFingerprint = contentFingerprintFor(item.uid) || undefined;
    }
  }

  return { ok: true, fetchedAt: new Date().toISOString(), items };
}

/**
 * @param {{
 *   uid: string,
 *   kind: "page" | "block",
 *   title: string,
 *   scope?: "self" | "tree",
 *   visibility?: string,
 *   groupIds?: string[],
 *   groupId?: string | null,
 * }} target
 */
export async function postPublish(target) {
  withAuthNote("publish");
  await new Promise((r) => setTimeout(r, 200));
  const publishedAt = new Date().toISOString();
  const scope = target.kind === "block" ? target.scope || "self" : undefined;
  const groupIds = normalizeGroupIds(
    target.groupIds ?? target.groupId ?? null,
  );
  const url =
    target.kind === "page"
      ? `https://example.com/p/${target.uid}`
      : `https://example.com/b/${target.uid}`;

  return withTeamFields({
    uid: target.uid,
    kind: target.kind,
    status: "published",
    scope,
    visibility: target.visibility || "unlisted",
    groupIds,
    title: target.title,
    url,
    publishedAt,
    contentFingerprint: contentFingerprintFor(target.uid),
  });
}

/**
 * Persist share-settings changes (visibility / teams / scope).
 * @param {string} uid
 * @param {{ visibility?: string, groupIds?: string[], groupId?: string | null, scope?: string }} patch
 * @param {object} current existing cache entry
 */
export async function postShareSettings(uid, patch, current) {
  withAuthNote("share settings");
  await new Promise((r) => setTimeout(r, 120));
  const groupIds =
    patch.groupIds !== undefined
      ? normalizeGroupIds(patch.groupIds)
      : patch.groupId !== undefined
        ? normalizeGroupIds(patch.groupId)
        : normalizeGroupIds(current.groupIds ?? current.groupId);
  return withTeamFields({
    uid,
    ...current,
    visibility: patch.visibility ?? current.visibility,
    groupIds,
    scope:
      current.kind === "block"
        ? patch.scope ?? current.scope
        : undefined,
  });
}

/**
 * Mark entry as freshly published (dummy republish / sync).
 * @param {string} uid
 * @param {object} current
 */
export async function postRepublish(uid, current) {
  withAuthNote("republish");
  await new Promise((r) => setTimeout(r, 150));
  return withTeamFields({
    uid,
    ...current,
    status: "published",
    publishedAt: new Date().toISOString(),
    contentFingerprint: contentFingerprintFor(uid),
    url:
      current.url ||
      (current.kind === "page"
        ? `https://example.com/p/${uid}`
        : `https://example.com/b/${uid}`),
  });
}

/** @param {string} uid */
export async function postUnpublish(uid) {
  withAuthNote("unpublish");
  await new Promise((r) => setTimeout(r, 50));
  return { ok: true, uid };
}
