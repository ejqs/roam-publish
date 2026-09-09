// src/groups.js
var DUMMY_TEAMS = [
  {
    id: "team-personal-blog",
    name: "Personal Blog",
    destination: "https://example.com/sites/personal-blog",
    permissions: "you can publish & manage"
  },
  {
    id: "team-work-docs",
    name: "Work Documents",
    destination: "https://example.com/sites/work-documents",
    permissions: "members can view & edit"
  }
];
function listTeams() {
  return DUMMY_TEAMS.slice();
}
function getTeam(id) {
  if (!id) return null;
  return DUMMY_TEAMS.find((t) => t.id === id) || null;
}
function normalizeGroupIds(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" && raw) list = [raw];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of list) {
    const id = typeof item === "string" ? item : null;
    if (!id || seen.has(id) || !getTeam(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function teamNameFor(id) {
  return getTeam(id)?.name || null;
}
function teamDestinationFor(id) {
  return getTeam(id)?.destination || null;
}
function teamNamesFor(ids) {
  return normalizeGroupIds(ids).map((id) => teamNameFor(id)).filter(Boolean);
}
function teamDestinationsFor(ids) {
  return normalizeGroupIds(ids).map((id) => teamDestinationFor(id)).filter(Boolean);
}
function formatTeamsDestinations(ids) {
  const normalized = normalizeGroupIds(ids);
  if (!normalized.length) return null;
  return normalized.map((id) => {
    const t = getTeam(id);
    return t ? `${t.name} \u2192 ${t.destination}` : null;
  }).filter(Boolean).join("; ");
}

// src/state.js
var publishCache = /* @__PURE__ */ new Map();
var cachedOpenUid = null;
var openUidInFlight = false;
var viewportWatcher = null;
function setPublishCache(next) {
  publishCache = next;
}
function clearPublishCache() {
  publishCache = /* @__PURE__ */ new Map();
}
function setCachedOpenUid(uid) {
  cachedOpenUid = uid;
}
function setOpenUidInFlight(value) {
  openUidInFlight = value;
}
function setViewportWatcher(watcher) {
  viewportWatcher = watcher;
}

// src/theme.js
var STATUS_THEME = {
  published: {
    label: "Published",
    badgeClass: "rp-publish-badge rp-publish-badge--published bp3-tag bp3-intent-success",
    ring: "rgba(15, 128, 70, 0.45)",
    tint: "rgba(15, 128, 70, 0.07)",
    treeBorder: "rgba(15, 128, 70, 0.35)",
    tagIntent: "bp3-intent-success"
  },
  outdated: {
    label: "Outdated",
    badgeClass: "rp-publish-badge rp-publish-badge--outdated bp3-tag bp3-intent-warning",
    ring: "rgba(180, 110, 0, 0.5)",
    tint: "rgba(180, 110, 0, 0.08)",
    treeBorder: "rgba(180, 110, 0, 0.4)",
    tagIntent: "bp3-intent-warning"
  },
  draft: {
    label: "Draft",
    badgeClass: "rp-publish-badge rp-publish-badge--draft bp3-tag",
    ring: "rgba(80, 90, 110, 0.45)",
    tint: "rgba(80, 90, 110, 0.07)",
    treeBorder: "rgba(80, 90, 110, 0.35)",
    tagIntent: ""
  }
};
var SCOPE_THEME = {
  self: { label: "This block only", short: "self" },
  tree: { label: "Block + children", short: "tree" }
};
var VISIBILITY_THEME = {
  private: { label: "Private", short: "private" },
  unlisted: { label: "Unlisted", short: "unlisted" },
  public: { label: "Public", short: "public" }
};
function normalizeStatus(status) {
  if (status === "outdated" || status === "draft") return status;
  return "published";
}
function normalizeScope(scope) {
  return scope === "tree" ? "tree" : "self";
}
function normalizeVisibility(visibility) {
  if (visibility === "private" || visibility === "unlisted") return visibility;
  return "public";
}
function statusLabel(status) {
  return STATUS_THEME[normalizeStatus(status)].label;
}
function statusBadgeClass(status) {
  return STATUS_THEME[normalizeStatus(status)].badgeClass;
}
function statusTagClass(status) {
  const theme = STATUS_THEME[normalizeStatus(status)];
  return ["bp3-tag", "bp3-minimal", theme.tagIntent].filter(Boolean).join(" ");
}
function scopeLabel(scope) {
  return SCOPE_THEME[normalizeScope(scope)].label;
}
function scopeShort(scope) {
  return SCOPE_THEME[normalizeScope(scope)].short;
}
function visibilityLabel(visibility) {
  return VISIBILITY_THEME[normalizeVisibility(visibility)].label;
}
function formatPublishedAt(iso) {
  if (!iso) return "Never published";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(void 0, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}
function entryTitleAttr(entry) {
  const parts = [statusLabel(entry.status)];
  if (entry.kind === "block") parts.push(scopeLabel(entry.scope));
  parts.push(visibilityLabel(entry.visibility));
  const teamLabel = (entry.groupNames && entry.groupNames.length ? entry.groupNames.join(", ") : null) || entry.groupName;
  if (teamLabel) parts.push(`Teams: ${teamLabel}`);
  if (entry.url) parts.push(entry.url);
  return parts.join(" \xB7 ");
}

// src/cache.js
var listeners = /* @__PURE__ */ new Set();
function onCacheChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emitCacheChange() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn("Roam Publish: cache listener failed", err);
    }
  }
}
function checkPublishState(uid) {
  return publishCache.get(uid) || null;
}
function listPublishEntries() {
  return [...publishCache.entries()].map(([uid, entry]) => ({ uid, ...entry })).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "page" ? -1 : 1;
    return String(a.title || a.uid).localeCompare(String(b.title || b.uid));
  });
}
function groupIdsFromRaw(entry) {
  if (entry.groupIds != null || entry.teamIds != null) {
    return normalizeGroupIds(entry.groupIds ?? entry.teamIds);
  }
  return normalizeGroupIds(entry.groupId || entry.teamId || null);
}
function normalizeEntry(entry) {
  if (!entry?.uid) return null;
  const kind = entry.kind === "block" ? "block" : "page";
  const groupIds = groupIdsFromRaw(entry);
  const groupNames = teamNamesFor(groupIds);
  const teamDestinations = teamDestinationsFor(groupIds);
  const groupId = groupIds[0] || null;
  return {
    status: normalizeStatus(entry.status),
    kind,
    scope: kind === "block" ? normalizeScope(entry.scope) : void 0,
    visibility: normalizeVisibility(entry.visibility),
    groupIds,
    groupNames,
    teamDestinations,
    // Legacy single-value mirrors (first selected team).
    groupId,
    groupName: groupNames[0] || teamNameFor(groupId),
    teamDestination: teamDestinations[0] || teamDestinationFor(groupId),
    title: entry.title,
    url: entry.url,
    publishedAt: entry.publishedAt,
    contentFingerprint: entry.contentFingerprint
  };
}
function upsertCacheEntry(entry) {
  if (!entry?.uid) return;
  const normalized = normalizeEntry(entry);
  if (!normalized) return;
  publishCache.set(entry.uid, normalized);
  emitCacheChange();
}
function deleteCacheEntry(uid) {
  publishCache.delete(uid);
  emitCacheChange();
}
function applyPublishIndex(payload) {
  const next = /* @__PURE__ */ new Map();
  for (const item of payload.items || []) {
    const normalized = normalizeEntry(item);
    if (!normalized || !item?.uid) continue;
    next.set(item.uid, normalized);
  }
  setPublishCache(next);
  emitCacheChange();
  return publishCache;
}

// src/constants.js
var BADGE_ATTR = "data-rp-badge";
var UID_ATTR = "data-uid";
var BLOCK_CTX_LABEL = "Roam Publish: Publish Block";
var BLOCK_CTX_UNPUBLISH_LABEL = "Roam Publish: Unpublish Block";
var PAGE_CTX_LABEL = "Roam Publish: Publish Page";
var PAGE_CTX_UNPUBLISH_LABEL = "Roam Publish: Unpublish Page";
var STYLE_ID = "rp-publish-dynamic-css";

// src/notify.js
function notify(message) {
  window.alert(message);
}

// src/settings-store.js
var extensionAPI = null;
function setExtensionAPI(api) {
  extensionAPI = api;
}
function getSetting(key) {
  try {
    return extensionAPI?.settings?.get?.(key) ?? null;
  } catch (_) {
    return null;
  }
}
function getApiKey() {
  const v = getSetting("api-key");
  return typeof v === "string" && v.trim() ? v.trim() : "";
}
function isDebugHudEnabled() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("rpDebug") === "1") {
      return true;
    }
  } catch (_) {
  }
  return getSetting("debug-hud") === true;
}

// src/roam.js
function isPageEntity(pull) {
  return Boolean(pull && pull[":node/title"] != null);
}
function entityKindFromPull(pull) {
  return isPageEntity(pull) ? "page" : "block";
}
function entityTitleFromPull(pull, uid) {
  return pull?.[":node/title"] || pull?.[":block/string"] || uid;
}
function pullEntity(uid) {
  if (!uid) return null;
  try {
    return window.roamAlphaAPI.pull(
      "[:block/uid :node/title :block/string :edit/time {:block/page [:block/uid :node/title]}]",
      [":block/uid", uid]
    );
  } catch (err) {
    console.warn("Roam Publish: pull failed", uid, err);
    return null;
  }
}
function pullEntityEditMeta(uid) {
  const pull = pullEntity(uid);
  if (!pull) return null;
  const title = pull[":node/title"];
  const str = pull[":block/string"];
  const fingerprint = String(title ?? str ?? "");
  const editTime = typeof pull[":edit/time"] === "number" ? pull[":edit/time"] : null;
  return { editTime, fingerprint };
}
function contentFingerprintFor(uid) {
  return pullEntityEditMeta(uid)?.fingerprint ?? "";
}
async function refreshCachedOpenUid() {
  if (openUidInFlight) return cachedOpenUid;
  setOpenUidInFlight(true);
  try {
    setCachedOpenUid(
      await window.roamAlphaAPI.ui.mainWindow.getOpenPageOrBlockUid()
    );
  } catch (err) {
    console.warn("Roam Publish: open uid refresh failed", err);
  } finally {
    setOpenUidInFlight(false);
  }
  return cachedOpenUid;
}
async function openUidInMainWindow(uid) {
  if (!uid) return;
  try {
    await window.roamAlphaAPI.ui.mainWindow.openBlock({ block: { uid } });
  } catch (err) {
    console.warn("Roam Publish: openBlock failed", uid, err);
  }
}

// src/api.js
function withAuthNote(label) {
  const key = getApiKey();
  if (key) {
    console.log(`Roam Publish: ${label} (dummy) with API key (${key.length} chars)`);
  } else {
    console.log(`Roam Publish: ${label} (dummy, no API key)`);
  }
  return key ? { Authorization: `Bearer ${key}` } : {};
}
function withTeamFields(record) {
  const groupIds = normalizeGroupIds(
    record.groupIds ?? record.teamIds ?? record.groupId ?? record.teamId
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
    teamDestination: teamDestinations[0] || teamDestinationFor(groupId)
  };
}
async function fetchPublishedIndex() {
  withAuthNote("fetching publish index");
  await new Promise((r) => setTimeout(r, 200));
  const items = [
    {
      uid: "dummy-page-alpha",
      kind: "page",
      status: "published",
      visibility: "public",
      groupIds: ["team-personal-blog"],
      title: "Dummy Alpha",
      url: "https://example.com/p/dummy-page-alpha",
      publishedAt: "2026-09-01T10:00:00Z"
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
      publishedAt: "2026-08-15T18:30:00Z"
    },
    {
      uid: "dummy-page-gamma",
      kind: "page",
      status: "draft",
      visibility: "private",
      groupIds: ["team-personal-blog", "team-work-docs"],
      title: "Dummy draft (not live)"
    }
  ];
  const seen = new Set(items.map((i) => i.uid));
  const openUid2 = await refreshCachedOpenUid();
  if (openUid2 && !seen.has(openUid2)) {
    const pull = pullEntity(openUid2);
    items.push({
      uid: openUid2,
      kind: entityKindFromPull(pull) || "page",
      status: "published",
      scope: "self",
      visibility: "unlisted",
      groupIds: ["team-personal-blog"],
      title: entityTitleFromPull(pull, openUid2),
      url: `https://example.com/demo/${openUid2}`,
      publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      contentFingerprint: contentFingerprintFor(openUid2)
    });
    seen.add(openUid2);
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
        publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
        contentFingerprint: contentFingerprintFor(focusedUid)
      });
    }
  }
  for (const item of items) {
    Object.assign(item, withTeamFields(item));
    if (!item.contentFingerprint) {
      item.contentFingerprint = contentFingerprintFor(item.uid) || void 0;
    }
  }
  return { ok: true, fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), items };
}
async function postPublish(target) {
  withAuthNote("publish");
  await new Promise((r) => setTimeout(r, 200));
  const publishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const scope = target.kind === "block" ? target.scope || "self" : void 0;
  const groupIds = normalizeGroupIds(
    target.groupIds ?? target.groupId ?? null
  );
  const url = target.kind === "page" ? `https://example.com/p/${target.uid}` : `https://example.com/b/${target.uid}`;
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
    contentFingerprint: contentFingerprintFor(target.uid)
  });
}
async function postShareSettings(uid, patch, current) {
  withAuthNote("share settings");
  await new Promise((r) => setTimeout(r, 120));
  const groupIds = patch.groupIds !== void 0 ? normalizeGroupIds(patch.groupIds) : patch.groupId !== void 0 ? normalizeGroupIds(patch.groupId) : normalizeGroupIds(current.groupIds ?? current.groupId);
  return withTeamFields({
    uid,
    ...current,
    visibility: patch.visibility ?? current.visibility,
    groupIds,
    scope: current.kind === "block" ? patch.scope ?? current.scope : void 0
  });
}
async function postRepublish(uid, current) {
  withAuthNote("republish");
  await new Promise((r) => setTimeout(r, 150));
  return withTeamFields({
    uid,
    ...current,
    status: "published",
    publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    contentFingerprint: contentFingerprintFor(uid),
    url: current.url || (current.kind === "page" ? `https://example.com/p/${uid}` : `https://example.com/b/${uid}`)
  });
}
async function postUnpublish(uid) {
  withAuthNote("unpublish");
  await new Promise((r) => setTimeout(r, 50));
  return { ok: true, uid };
}

// src/dom/finders.js
function findBlockEl(uid) {
  return document.getElementById(`block-input-${uid}`) || document.querySelector(`[${UID_ATTR}="${CSS.escape(uid)}"]`) || document.querySelector(`[id="block-input-${CSS.escape(uid)}"]`) || document.querySelector(`.roam-block[id="${CSS.escape(uid)}"]`) || document.querySelector(`[id$="${CSS.escape(uid)}"]`) || null;
}
function titleLayout() {
  const title = document.querySelector(".rm-title-display") || document.querySelector(".rm-page__title");
  if (!title) return null;
  const rect = title.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const article = title.closest(".roam-article") || title.closest(".rm-article-wrapper") || title.parentElement;
  const articleW = article?.getBoundingClientRect()?.width || window.innerWidth;
  const narrow = window.innerWidth < 720 || articleW < 520 || rect.width > articleW * 0.72;
  return { rect, narrow, el: title };
}
function blockMainLayout(uid) {
  const blockEl = findBlockEl(uid);
  if (!blockEl) return null;
  const main = blockEl.closest(".rm-block-main") || blockEl.closest(".roam-block-container") || blockEl.closest(".rm-block") || blockEl;
  const rect = main.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return { rect, el: main };
}
function findBulletEl(uid) {
  const blockEl = findBlockEl(uid);
  if (!blockEl) return null;
  const main = blockEl.closest(".rm-block-main") || blockEl.closest(".roam-block-container") || blockEl.closest(".rm-block") || blockEl.parentElement;
  if (!main) return null;
  const candidates = [
    ".rm-bullet__inner",
    ".simple-bullet-inner",
    ".rm-bullet .rm-bullet__inner",
    ".rm-bullet",
    ".roam-bullet-closed",
    ".simple-bullet-outer",
    ".controls .bp3-popover-target",
    ".controls .rm-bullet",
    ".block-expand"
  ];
  for (const sel of candidates) {
    const hit = main.querySelector(sel);
    if (hit) {
      const r = hit.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return hit;
    }
  }
  const controls = main.querySelector(".controls");
  if (controls) {
    const r = controls.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return controls;
  }
  return null;
}
function isRectVisible(rect) {
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  return !(rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth);
}

// src/overlays/badges.js
function placeOverlayBadge(layer, uid, entry, layout) {
  const rect = layout?.rect;
  if (!rect || !isRectVisible(rect)) return;
  let badge = layer.querySelector(
    `[${BADGE_ATTR}="${CSS.escape(uid)}"][data-rp-kind="page"]`
  );
  if (!badge) {
    badge = document.createElement("button");
    badge.type = "button";
    badge.setAttribute(BADGE_ATTR, uid);
    badge.setAttribute("data-rp-kind", "page");
    badge.setAttribute("data-rp-open-share", uid);
    layer.appendChild(badge);
  }
  badge.className = `${statusBadgeClass(entry.status)} bp3-interactive`;
  badge.innerHTML = `<span class="bp3-icon bp3-icon-share" aria-hidden="true"></span><span class="rp-publish-badge-label">${escapeHtml(
    statusLabel(entry.status)
  )} \xB7 ${escapeHtml(visibilityLabel(entry.visibility))}</span>`;
  badge.title = `${entryTitleAttr(entry)} \u2014 click for share settings`;
  badge.style.display = "inline-flex";
  badge.style.visibility = "visible";
  badge.style.opacity = "1";
  badge.style.pointerEvents = "auto";
  const gap = 6;
  const badgeH = 24;
  const belowTop = rect.bottom + gap;
  const roomBelow = belowTop + badgeH < window.innerHeight - 8;
  const narrow = window.innerWidth < 720 || (layout?.narrow ?? false);
  if (narrow || roomBelow) {
    badge.style.top = `${Math.round(belowTop)}px`;
    badge.style.left = `${Math.round(Math.max(8, rect.left))}px`;
    badge.style.transform = "none";
    badge.style.maxWidth = `${Math.max(
      140,
      Math.min(rect.width, window.innerWidth - rect.left - 16)
    )}px`;
  } else {
    const left = Math.min(rect.right + 8, window.innerWidth - 180);
    badge.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    badge.style.left = `${Math.round(Math.max(rect.left, left))}px`;
    badge.style.transform = "translateY(-50%)";
    badge.style.maxWidth = "180px";
  }
}
function placeBlockShareChip(layer, uid, entry) {
  const layout = blockMainLayout(uid);
  const rect = layout?.rect;
  if (!rect || !isRectVisible(rect)) return false;
  let chip = layer.querySelector(
    `[${BADGE_ATTR}="${CSS.escape(uid)}"][data-rp-kind="block-chip"]`
  );
  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.setAttribute(BADGE_ATTR, uid);
    chip.setAttribute("data-rp-kind", "block-chip");
    chip.setAttribute("data-rp-open-share", uid);
    layer.appendChild(chip);
  }
  const theme = STATUS_THEME[normalizeStatus(entry.status)];
  chip.className = [
    "rp-block-share-chip",
    "bp3-tag",
    "bp3-minimal",
    "bp3-small",
    "bp3-interactive",
    theme.tagIntent
  ].filter(Boolean).join(" ");
  chip.textContent = scopeShort(entry.scope);
  chip.title = `${entryTitleAttr(entry)} \u2014 click for share settings`;
  chip.style.display = "inline-flex";
  chip.style.visibility = "visible";
  chip.style.opacity = "0.92";
  chip.style.pointerEvents = "auto";
  const bullet = findBulletEl(uid);
  const bulletRect = bullet?.getBoundingClientRect();
  const midY = bulletRect ? bulletRect.top + bulletRect.height / 2 : rect.top + Math.min(14, rect.height / 2);
  const chipW = 44;
  const left = Math.min(rect.right - 4, window.innerWidth - 8);
  chip.style.top = `${Math.round(midY)}px`;
  chip.style.left = `${Math.round(left)}px`;
  chip.style.transform = "translate(-100%, -50%)";
  chip.style.maxWidth = `${chipW + 8}px`;
  if (rect.width < 80) {
    chip.style.left = `${Math.round(window.innerWidth - 8)}px`;
  }
  return true;
}
function clearBadge(uid) {
  const layer = document.getElementById("rp-publish-layer");
  if (!layer) return;
  layer.querySelectorAll(`[${BADGE_ATTR}="${CSS.escape(uid)}"]`).forEach((el) => el.remove());
}
function formatBlockHudLine(entry) {
  if (!entry) return null;
  return `${statusLabel(entry.status)} \xB7 ${scopeShort(entry.scope)} \xB7 ${visibilityLabel(
    entry.visibility
  )}`;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/overlays/hud.js
var layerDelegated = false;
var hudDelegated = false;
var openShareHandler = null;
function setOpenShareHandler(handler) {
  openShareHandler = handler;
}
function ensureOverlayRoots() {
  let layer = document.getElementById("rp-publish-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "rp-publish-layer";
    document.body.appendChild(layer);
  }
  layer.style.display = "";
  if (!layerDelegated) {
    layer.addEventListener("click", (ev) => {
      const btn = ev.target instanceof Element ? ev.target.closest("[data-rp-open-share]") : null;
      if (!btn) return;
      const uid = btn.getAttribute("data-rp-open-share");
      if (!uid || !openShareHandler) return;
      ev.preventDefault();
      ev.stopPropagation();
      openShareHandler(
        uid,
        /** @type {MouseEvent} */
        ev
      );
    });
    layerDelegated = true;
  }
  let hud = document.getElementById("rp-publish-hud");
  const debug = isDebugHudEnabled();
  if (debug) {
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "rp-publish-hud";
      hud.className = "bp3-card bp3-elevation-2";
      document.body.appendChild(hud);
    }
    hud.style.display = "";
    if (!hudDelegated) {
      hud.addEventListener("click", (ev) => {
        const btn = ev.target instanceof Element ? ev.target.closest("[data-rp-open-share]") : null;
        if (!btn) return;
        const uid = btn.getAttribute("data-rp-open-share");
        if (!uid || !openShareHandler) return;
        ev.preventDefault();
        ev.stopPropagation();
        openShareHandler(
          uid,
          /** @type {MouseEvent} */
          ev
        );
      });
      hudDelegated = true;
    }
  } else if (hud) {
    hud.style.display = "none";
    hud.innerHTML = "";
  }
  return { layer, hud: debug ? hud : null };
}
function destroyOverlayRoots() {
  document.getElementById("rp-publish-layer")?.remove();
  document.getElementById("rp-publish-hud")?.remove();
  layerDelegated = false;
  hudDelegated = false;
}
function updateHud(hud) {
  if (!hud || !isDebugHudEnabled()) {
    const existing = document.getElementById("rp-publish-hud");
    if (existing) {
      existing.style.display = "none";
      existing.innerHTML = "";
    }
    return;
  }
  const focusedUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
  const openUid2 = cachedOpenUid;
  const open = openUid2 ? publishCache.get(openUid2) : null;
  const focused = focusedUid && focusedUid !== openUid2 ? publishCache.get(focusedUid) : null;
  const lines = [
    `<div class="rp-hud-title"><span class="bp3-tag bp3-intent-primary bp3-minimal bp3-small">Debug</span> Roam Publish</div>`
  ];
  if (open && openUid2) {
    lines.push(
      `<button type="button" class="rp-hud-row rp-hud-action" data-rp-open-share="${escapeAttr(
        openUid2
      )}">Page: ${escapeHtml2(statusLabel(open.status))} \xB7 ${escapeHtml2(
        visibilityLabel(open.visibility)
      )}</button>`
    );
  } else {
    lines.push(
      `<div class="rp-hud-row rp-hud-muted">Page: not published</div>`
    );
  }
  if (focusedUid) {
    const blockLine = formatBlockHudLine(focused);
    if (blockLine && focused) {
      lines.push(
        `<button type="button" class="rp-hud-row rp-hud-action" data-rp-open-share="${escapeAttr(
          focusedUid
        )}">Block: ${escapeHtml2(blockLine)}</button>`
      );
    } else {
      lines.push(
        `<div class="rp-hud-row rp-hud-muted">Block: not published</div>`
      );
    }
  } else {
    lines.push(
      `<div class="rp-hud-row rp-hud-muted">Block: (none focused)</div>`
    );
  }
  lines.push(
    `<div class="rp-hud-row rp-hud-muted">Cache: ${publishCache.size} item(s)</div>`
  );
  hud.style.display = "";
  hud.innerHTML = lines.join("");
}
function escapeHtml2(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(s) {
  return escapeHtml2(s).replace(/'/g, "&#39;");
}

// src/styles.js
function syncPublishStylesheet() {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const rules = [];
  for (const [uid, entry] of publishCache) {
    if (entry.kind !== "block") continue;
    const safe = CSS.escape(uid);
    const theme = STATUS_THEME[normalizeStatus(entry.status)];
    const scope = normalizeScope(entry.scope);
    const container = blockContainerSelector(safe);
    rules.push(`
${container} .rm-bullet,
${container} .rm-bullet__inner,
${container} .controls > .rm-bullet {
  border-radius: 50% !important;
  box-sizing: content-box !important;
  box-shadow: 0 0 0 2px ${theme.ring} !important;
}`);
    if (scope === "tree") {
      rules.push(`
${container} {
  outline: 1.5px solid ${theme.treeBorder};
  outline-offset: 2px;
  border-radius: 6px;
  background: ${theme.tint};
}
${container} > .rm-block-main {
  border-radius: 4px 4px 0 0;
}`);
    } else {
      rules.push(`
${container} > .rm-block-main {
  background: ${theme.tint};
  border-radius: 4px;
}`);
    }
  }
  style.textContent = rules.join("\n");
}
function blockContainerSelector(safeUid) {
  return [
    `[data-uid="${safeUid}"]`,
    `.rm-block:has([id="block-input-${safeUid}"])`,
    `.roam-block-container:has([id="block-input-${safeUid}"])`
  ].join(",\n");
}
function clearPublishStylesheet() {
  document.getElementById(STYLE_ID)?.remove();
}

// src/overlays/paint.js
var paintScheduled = false;
var paintDirty = false;
function isRoamOverlayOpen() {
  if (document.querySelector(".rm-typeahead-autocomplete") || document.querySelector(".rm-typeahead") || document.querySelector(".rm-command-palette") || document.querySelector(".rm-omnibar") || document.querySelector("[class*='rm-command-palette']") || // Topbar Find or Create (search results dropdown).
  document.activeElement?.id === "find-or-create-input" || document.querySelector(".rm-find-or-create-wrapper .bp3-overlay-open") || document.querySelector(".rm-find-or-create-wrapper .bp3-popover")) {
    return true;
  }
  if (document.getElementById("rp-published-portal")) return true;
  for (const el of document.querySelectorAll(".bp3-overlay-open")) {
    if (!(el instanceof Element)) continue;
    if (el.closest("#rp-share-popover")) continue;
    if (el.closest(
      ".bp3-popover, .bp3-toast-container, .bp3-toaster, .bp3-tooltip"
    )) {
      continue;
    }
    if (el.querySelector(".bp3-popover, .bp3-toast, .bp3-tooltip")) continue;
    if (el.classList.contains("bp3-overlay-scroll-container") || el.querySelector(".bp3-dialog, .bp3-drawer")) {
      return true;
    }
  }
  return false;
}
function scrubLegacyInTreeBadges() {
  document.querySelectorAll(
    `.rm-block-main > [${BADGE_ATTR}], .rm-title-display > [${BADGE_ATTR}], .rm-block__input > [${BADGE_ATTR}], .rm-page__title > [${BADGE_ATTR}]`
  ).forEach((el) => el.remove());
}
function schedulePaint() {
  paintDirty = true;
  if (paintScheduled) return;
  paintScheduled = true;
  const run = () => {
    paintDirty = false;
    paintOverlays();
    if (paintDirty) requestAnimationFrame(run);
    else paintScheduled = false;
  };
  requestAnimationFrame(run);
}
function paintOverlays() {
  scrubLegacyInTreeBadges();
  const { layer, hud } = ensureOverlayRoots();
  if (isRoamOverlayOpen()) {
    layer.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => el.remove());
    layer.style.visibility = "hidden";
    updateHud(hud);
    return;
  }
  layer.style.visibility = "";
  layer.style.display = "";
  layer.style.opacity = "";
  const seen = /* @__PURE__ */ new Set();
  for (const [uid, entry] of publishCache) {
    if (entry.kind === "page") {
      if (uid !== cachedOpenUid) continue;
      const layout = titleLayout();
      if (!layout?.rect) continue;
      placeOverlayBadge(layer, uid, entry, layout);
      seen.add(uid);
      continue;
    }
    if (placeBlockShareChip(layer, uid, entry)) {
      seen.add(uid);
    }
  }
  layer.querySelectorAll(`[${BADGE_ATTR}]`).forEach((el) => {
    const uid = el.getAttribute(BADGE_ATTR);
    if (!uid || !seen.has(uid)) el.remove();
  });
  updateHud(hud);
}
function removeAllBadges() {
  scrubLegacyInTreeBadges();
  destroyOverlayRoots();
  clearPublishStylesheet();
}

// src/target.js
async function resolvePublishTarget({ uid, kind } = {}) {
  let targetUid = uid;
  let targetKind = kind;
  if (!targetUid) {
    if (targetKind === "block") {
      targetUid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
    } else {
      targetUid = await refreshCachedOpenUid();
    }
  }
  if (!targetUid) {
    notify(
      targetKind === "block" ? "Focus a block first, then publish it." : "Open a page first, then publish it."
    );
    return null;
  }
  let pull = pullEntity(targetUid);
  if (!pull) {
    notify(`Could not load uid ${targetUid}`);
    return null;
  }
  if (targetKind === "block" && isPageEntity(pull)) {
    const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
    if (focused && focused !== targetUid) {
      targetUid = focused;
      pull = pullEntity(targetUid);
      if (!pull) {
        notify("Focus a block first, then publish it.");
        return null;
      }
    }
  }
  const finalKind = targetKind === "page" || isPageEntity(pull) ? "page" : "block";
  if (targetKind === "block" && finalKind === "page") {
    notify("Focus a block first, then publish it.");
    return null;
  }
  return {
    uid: targetUid,
    kind: finalKind,
    title: entityTitleFromPull(pull, targetUid),
    pull
  };
}

// src/publish.js
var dismissSharePopover = () => {
};
function setSharePopoverDismiss(fn) {
  dismissSharePopover = fn || (() => {
  });
}
async function publish({
  uid,
  kind,
  scope,
  visibility,
  groupIds,
  groupId
} = {}) {
  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return null;
  const record = await postPublish({
    uid: target.uid,
    kind: target.kind,
    title: target.title,
    scope: target.kind === "block" ? normalizeScope(scope) : void 0,
    visibility: normalizeVisibility(visibility),
    groupIds: normalizeGroupIds(groupIds ?? groupId ?? null)
  });
  upsertCacheEntry(record);
  if (record.kind === "page") setCachedOpenUid(record.uid);
  console.log("Roam Publish: published (dummy)", record);
  schedulePaint();
  return publishCache.get(record.uid);
}
async function unpublish({ uid, kind } = {}) {
  const target = await resolvePublishTarget({ uid, kind });
  if (!target) return;
  if (!publishCache.has(target.uid)) {
    notify("Nothing published for that uid.");
    return;
  }
  await postUnpublish(target.uid);
  deleteCacheEntry(target.uid);
  clearBadge(target.uid);
  dismissSharePopover();
  console.log("Roam Publish: unpublished (dummy)", target.uid);
  notify(`Unpublished ${target.kind} (dummy).`);
  schedulePaint();
}
async function unpublishUid(uid) {
  if (!uid || !publishCache.has(uid)) {
    notify("Nothing published for that uid.");
    return;
  }
  await postUnpublish(uid);
  deleteCacheEntry(uid);
  clearBadge(uid);
  dismissSharePopover();
  console.log("Roam Publish: unpublished (dummy)", uid);
  notify("Unpublished (dummy).");
  schedulePaint();
}
async function updateShareSettings(uid, patch) {
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  const next = await postShareSettings(uid, patch, current);
  upsertCacheEntry(next);
  schedulePaint();
  return publishCache.get(uid);
}
async function republish(uid) {
  const current = checkPublishState(uid);
  if (!current) {
    notify("Nothing published for that uid.");
    return null;
  }
  const next = await postRepublish(uid, current);
  upsertCacheEntry(next);
  schedulePaint();
  notify("Updated published copy (dummy).");
  return publishCache.get(uid);
}
async function refreshPublishCache() {
  console.log("Roam Publish: fetching publish index (dummy)\u2026");
  const payload = await fetchPublishedIndex();
  applyPublishIndex(payload);
  console.log(
    "Roam Publish: cache ready",
    payload.fetchedAt,
    Object.fromEntries(publishCache)
  );
  schedulePaint();
  return publishCache;
}

// src/outdated.js
function maybeMarkOutdated(uid) {
  const entry = checkPublishState(uid);
  if (!entry || entry.status === "outdated" || entry.status === "draft") {
    return false;
  }
  if (!entry.publishedAt) return false;
  const meta = pullEntityEditMeta(uid);
  if (!meta) return false;
  const publishedMs = Date.parse(entry.publishedAt);
  if (Number.isNaN(publishedMs)) return false;
  let localMs = 0;
  if (typeof meta.editTime === "number" && meta.editTime > 0) {
    localMs = meta.editTime < 1e12 ? meta.editTime * 1e3 : meta.editTime;
  }
  const fingerprintDrift = Boolean(entry.contentFingerprint) && Boolean(meta.fingerprint) && entry.contentFingerprint !== meta.fingerprint;
  const timeDrift = localMs > publishedMs + 500;
  if (!fingerprintDrift && !timeDrift) return false;
  upsertCacheEntry({
    ...entry,
    uid,
    status: "outdated"
  });
  schedulePaint();
  return true;
}
function scanAllForOutdated() {
  let changed = false;
  for (const uid of publishCache.keys()) {
    if (maybeMarkOutdated(uid)) changed = true;
  }
  return changed;
}

// src/share-popover.js
var POPOVER_ID = "rp-share-popover";
var openUid = null;
var outsideHandler = null;
var keyHandler = null;
function closeSharePopover() {
  document.getElementById(POPOVER_ID)?.remove();
  if (outsideHandler) {
    document.removeEventListener("mousedown", outsideHandler, true);
    outsideHandler = null;
  }
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler, true);
    keyHandler = null;
  }
  openUid = null;
}
setSharePopoverDismiss(() => closeSharePopover());
function openSharePopover(uid, opts = {}) {
  maybeMarkOutdated(uid);
  const entry = checkPublishState(uid);
  if (!entry) {
    notify("Nothing published for that uid. Publish first, then open share settings.");
    return;
  }
  closeSharePopover();
  openUid = uid;
  const pop = document.createElement("div");
  pop.id = POPOVER_ID;
  pop.className = "bp3-card bp3-elevation-3 rp-share-popover";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-label", "Share settings");
  pop.innerHTML = renderPopoverHtml(uid, entry);
  document.body.appendChild(pop);
  positionPopover(pop, opts);
  bindPopover(pop, uid);
  outsideHandler = (e) => {
    if (!(e.target instanceof Node)) return;
    if (pop.contains(e.target)) return;
    if (e.target instanceof Element && e.target.closest("[data-rp-open-share]")) {
      return;
    }
    closeSharePopover();
  };
  keyHandler = (e) => {
    if (e.key === "Escape") closeSharePopover();
  };
  window.setTimeout(() => {
    document.addEventListener("mousedown", outsideHandler, true);
    document.addEventListener("keydown", keyHandler, true);
  }, 0);
}
function refreshSharePopoverIfOpen() {
  if (!openUid) return;
  const pop = document.getElementById(POPOVER_ID);
  if (!pop) return;
  const entry = checkPublishState(openUid);
  if (!entry) {
    closeSharePopover();
    return;
  }
  const rect = pop.getBoundingClientRect();
  pop.innerHTML = renderPopoverHtml(openUid, entry);
  bindPopover(pop, openUid);
  positionPopover(pop, {
    clientX: rect.left,
    clientY: rect.top
  });
}
function renderPopoverHtml(uid, entry) {
  const teams = listTeams();
  const selectedIds = new Set(
    normalizeGroupIds(entry.groupIds ?? entry.groupId)
  );
  const teamCheckboxes = teams.map((t) => {
    const checked = selectedIds.has(t.id) ? "checked" : "";
    return `<label class="bp3-control bp3-checkbox rp-share-radio">
        <input type="checkbox" name="rp-team" value="${escapeAttr2(t.id)}" ${checked} />
        <span class="bp3-control-indicator"></span>
        <span class="rp-share-team-label">
          <strong>${escapeHtml3(t.name)}</strong>
          <span class="bp3-text-muted">${escapeHtml3(t.destination)}</span>
        </span>
      </label>`;
  }).join("");
  const selectedDest = formatTeamsDestinations([...selectedIds]) || "";
  const visibilityOptions = ["private", "unlisted", "public"].map(
    (v) => `<label class="bp3-control bp3-radio rp-share-radio">
          <input type="radio" name="rp-visibility" value="${v}" ${normalizeVisibility(entry.visibility) === v ? "checked" : ""} />
          <span class="bp3-control-indicator"></span>
          ${visibilityLabel(v)}
        </label>`
  ).join("");
  const scopeSection = entry.kind === "block" ? `<section class="rp-share-section">
          <h4 class="bp3-heading rp-share-heading">Include</h4>
          <div class="rp-share-radios">
            <label class="bp3-control bp3-radio rp-share-radio">
              <input type="radio" name="rp-scope" value="self" ${normalizeScope(entry.scope) === "self" ? "checked" : ""} />
              <span class="bp3-control-indicator"></span>
              ${scopeLabel("self")}
            </label>
            <label class="bp3-control bp3-radio rp-share-radio">
              <input type="radio" name="rp-scope" value="tree" ${normalizeScope(entry.scope) === "tree" ? "checked" : ""} />
              <span class="bp3-control-indicator"></span>
              ${scopeLabel("tree")}
            </label>
          </div>
        </section>` : "";
  const needsUpdate = entry.status === "outdated" || entry.status === "draft";
  const updateHint = needsUpdate ? `<div class="bp3-callout bp3-intent-warning bp3-icon-warning-sign rp-share-callout">
         Local content changed since last publish. Click <strong>Update</strong> to republish.
       </div>` : `<p class="bp3-text-muted rp-share-hint">Up to date with the last publish.</p>`;
  return `
    <div class="rp-share-header">
      <div>
        <div class="bp3-text-muted rp-share-kicker">${escapeHtml3(entry.kind)}</div>
        <div class="bp3-heading rp-share-title">${escapeHtml3(entry.title || uid)}</div>
      </div>
      <button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-cross"
        data-rp-share-close aria-label="Close"></button>
    </div>

    <section class="rp-share-section">
      <h4 class="bp3-heading rp-share-heading">Update state</h4>
      <div class="rp-share-row">
        <span class="${statusTagClass(entry.status)}">${escapeHtml3(
    statusLabel(entry.status)
  )}</span>
        <span class="bp3-text-muted">Published ${escapeHtml3(
    formatPublishedAt(entry.publishedAt)
  )}</span>
      </div>
      ${updateHint}
      <div class="rp-share-actions">
        <button type="button" class="bp3-button bp3-intent-primary bp3-small"
          data-rp-share-update ${needsUpdate ? "" : "disabled"}>Update</button>
        ${entry.url ? `<a class="bp3-button bp3-minimal bp3-small" href="${escapeAttr2(
    entry.url
  )}" target="_blank" rel="noopener noreferrer">Open published</a>` : `<span class="bp3-text-muted">No live URL yet</span>`}
      </div>
    </section>

    <section class="rp-share-section">
      <h4 class="bp3-heading rp-share-heading">Teams</h4>
      <p class="bp3-text-muted rp-share-hint">Share to one or more team sites.</p>
      <div class="rp-share-radios" data-rp-share-teams>
        ${teamCheckboxes}
      </div>
      <p class="bp3-text-muted rp-share-dest" data-rp-share-dest>
        ${selectedDest ? escapeHtml3(selectedDest) : "No teams selected"}
      </p>
    </section>

    <section class="rp-share-section">
      <h4 class="bp3-heading rp-share-heading">Visibility</h4>
      <div class="rp-share-radios" data-rp-share-visibility>
        ${visibilityOptions}
      </div>
    </section>

    ${scopeSection}

    <div class="rp-share-footer">
      <button type="button" class="bp3-button bp3-intent-danger bp3-minimal bp3-small"
        data-rp-share-unpublish>Unpublish</button>
      <button type="button" class="bp3-button bp3-small" data-rp-share-save>Save settings</button>
    </div>
  `;
}
function bindPopover(pop, uid) {
  pop.querySelector("[data-rp-share-close]")?.addEventListener("click", () => {
    closeSharePopover();
  });
  pop.querySelector("[data-rp-share-update]")?.addEventListener("click", () => {
    void republish(uid).then(() => {
      refreshSharePopoverIfOpen();
    });
  });
  pop.querySelector("[data-rp-share-unpublish]")?.addEventListener("click", () => {
    void unpublishUid(uid);
  });
  const destEl = pop.querySelector("[data-rp-share-dest]");
  const syncDestPreview = () => {
    const ids = [
      ...pop.querySelectorAll('input[name="rp-team"]:checked')
    ].map((el) => (
      /** @type {HTMLInputElement} */
      el.value
    ));
    const dest = formatTeamsDestinations(ids);
    if (destEl) {
      destEl.textContent = dest || "No teams selected";
    }
  };
  pop.querySelectorAll('input[name="rp-team"]').forEach((el) => {
    el.addEventListener("change", syncDestPreview);
  });
  pop.querySelector("[data-rp-share-save]")?.addEventListener("click", () => {
    const visibility = (
      /** @type {HTMLInputElement | null} */
      pop.querySelector('input[name="rp-visibility"]:checked')?.value
    );
    const groupIds = [
      ...pop.querySelectorAll('input[name="rp-team"]:checked')
    ].map((el) => (
      /** @type {HTMLInputElement} */
      el.value
    ));
    const scope = (
      /** @type {HTMLInputElement | null} */
      pop.querySelector('input[name="rp-scope"]:checked')?.value
    );
    void updateShareSettings(uid, {
      visibility,
      groupIds,
      scope
    }).then(() => {
      refreshSharePopoverIfOpen();
      notify("Share settings saved (dummy).");
    });
  });
}
function positionPopover(pop, opts) {
  const pad = 12;
  const width = Math.min(360, window.innerWidth - pad * 2);
  pop.style.width = `${width}px`;
  let left = opts.clientX ?? opts.anchorRect?.left ?? window.innerWidth - width - 24;
  let top = opts.clientY ?? (opts.anchorRect ? opts.anchorRect.bottom + 8 : 80);
  const rect = pop.getBoundingClientRect();
  if (left + rect.width > window.innerWidth - pad) {
    left = window.innerWidth - rect.width - pad;
  }
  if (left < pad) left = pad;
  if (top + rect.height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - rect.height - pad);
  }
  if (top < pad) top = pad;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}
function escapeHtml3(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr2(s) {
  return escapeHtml3(s).replace(/'/g, "&#39;");
}

// src/published-list.js
var PORTAL_ID = "rp-published-portal";
var dialogUnsub = null;
var keyHandler2 = null;
function closePublishedItemsDialog() {
  document.getElementById(PORTAL_ID)?.remove();
  dialogUnsub?.();
  dialogUnsub = null;
  if (keyHandler2) {
    document.removeEventListener("keydown", keyHandler2, true);
    keyHandler2 = null;
  }
}
function openPublishedItemsDialog() {
  closePublishedItemsDialog();
  const portal = document.createElement("div");
  portal.id = PORTAL_ID;
  portal.className = "bp3-portal rp-published-portal";
  portal.innerHTML = `
    <div class="bp3-overlay bp3-overlay-open bp3-overlay-scroll-container rp-published-overlay">
      <div class="bp3-overlay-backdrop rp-published-backdrop" data-rp-published-close></div>
      <div class="bp3-dialog-container rp-published-dialog-container">
        <div class="bp3-dialog rp-published-dialog" role="dialog" aria-modal="true"
          aria-labelledby="rp-published-title">
          <div class="bp3-dialog-header">
            <span class="bp3-icon bp3-icon-share bp3-icon-large" aria-hidden="true"></span>
            <h4 class="bp3-heading" id="rp-published-title">Published items</h4>
            <button type="button" class="bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross"
              data-rp-published-close aria-label="Close"></button>
          </div>
          <div class="bp3-dialog-body" data-rp-published-body></div>
          <div class="bp3-dialog-footer">
            <div class="bp3-dialog-footer-actions">
              <span class="bp3-text-muted rp-published-count" data-rp-published-count></span>
              <button type="button" class="bp3-button" data-rp-published-close>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(portal);
  const fill = () => {
    const items = listPublishEntries();
    const body = portal.querySelector("[data-rp-published-body]");
    const count = portal.querySelector("[data-rp-published-count]");
    if (body) body.innerHTML = renderItemsHtml(items);
    if (count) {
      count.textContent = items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : "";
    }
    bindItemActions(portal);
  };
  fill();
  dialogUnsub = onCacheChange(fill);
  portal.querySelectorAll("[data-rp-published-close]").forEach((el) => {
    el.addEventListener("click", () => closePublishedItemsDialog());
  });
  keyHandler2 = (e) => {
    if (e.key === "Escape") closePublishedItemsDialog();
  };
  document.addEventListener("keydown", keyHandler2, true);
}
function renderItemsHtml(items) {
  if (!items.length) {
    return `<p class="bp3-text-muted rp-published-empty">No published items in cache. Publish a page or block, then reopen this window.</p>`;
  }
  return `
    <div class="rp-published-list" role="list">
      ${items.map((item) => renderItemRow(item)).join("")}
    </div>
  `;
}
function renderItemRow(item) {
  const title = escapeHtml4(item.title || item.uid);
  const teamNames = (item.groupNames && item.groupNames.length ? item.groupNames.join(", ") : null) || item.groupName;
  const team = teamNames ? escapeHtml4(teamNames) : "\u2014";
  const scope = item.kind === "block" ? escapeHtml4(scopeLabel(item.scope)) : "\u2014";
  const url = item.url ? `<a class="rp-published-item-link" href="${escapeAttr3(
    item.url
  )}" target="_blank" rel="noopener noreferrer" data-rp-stop>${escapeHtml4(
    item.url
  )}</a>` : `<span class="bp3-text-muted">No live URL</span>`;
  return `
    <div class="rp-published-item bp3-card bp3-interactive bp3-elevation-0"
      role="listitem" tabindex="0"
      data-rp-published-uid="${escapeAttr3(item.uid)}"
      data-rp-published-kind="${escapeAttr3(item.kind)}">
      <div class="rp-published-item-top">
        <span class="bp3-tag bp3-minimal bp3-small">${escapeHtml4(item.kind)}</span>
        <span class="${statusTagClass(item.status)} bp3-small">${escapeHtml4(
    statusLabel(item.status)
  )}</span>
        <span class="bp3-tag bp3-minimal bp3-small">${escapeHtml4(
    visibilityLabel(item.visibility)
  )}</span>
        <span class="rp-published-item-actions">
          <button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-document-open"
            data-rp-open-uid="${escapeAttr3(item.uid)}" title="Open in Roam">Open</button>
          <button type="button" class="bp3-button bp3-minimal bp3-small bp3-intent-primary"
            data-rp-open-share-item="${escapeAttr3(item.uid)}">Share</button>
        </span>
      </div>
      <div class="rp-published-item-title">${title}</div>
      <div class="rp-published-item-meta bp3-text-muted">
        <span>Teams: ${team}</span>
        <span>Scope: ${scope}</span>
        <span>Published: ${escapeHtml4(formatPublishedAt(item.publishedAt))}</span>
      </div>
      <div class="rp-published-item-url">${url}</div>
    </div>
  `;
}
function bindItemActions(root) {
  root.querySelectorAll("[data-rp-open-share-item]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const uid = (
        /** @type {Element} */
        ev.currentTarget.getAttribute(
          "data-rp-open-share-item"
        )
      );
      if (!uid) return;
      closePublishedItemsDialog();
      openSharePopover(uid);
    });
  });
  root.querySelectorAll("[data-rp-open-uid]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const uid = (
        /** @type {Element} */
        ev.currentTarget.getAttribute(
          "data-rp-open-uid"
        )
      );
      if (!uid) return;
      closePublishedItemsDialog();
      void openUidInMainWindow(uid);
    });
  });
  root.querySelectorAll("[data-rp-published-uid]").forEach((row) => {
    const openShare = () => {
      const uid = row.getAttribute("data-rp-published-uid");
      if (!uid) return;
      closePublishedItemsDialog();
      openSharePopover(uid);
    };
    row.addEventListener("click", (ev) => {
      const t = (
        /** @type {Element} */
        ev.target
      );
      if (t.closest?.("[data-rp-stop], a, button")) return;
      openShare();
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openShare();
      }
    });
  });
}
function escapeHtml4(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr3(s) {
  return escapeHtml4(s).replace(/'/g, "&#39;");
}

// src/settings.js
function buildSettings(extensionAPI2) {
  setExtensionAPI(extensionAPI2);
  void extensionAPI2.settings.panel.create({
    tabTitle: "Roam Publish",
    settings: [
      {
        id: "api-key",
        name: "API key",
        description: "Stored in this graph\u2019s extension settings. Used by the publish API layer (dummy mode still works if empty).",
        action: {
          type: "input",
          placeholder: "Paste API key\u2026"
        }
      },
      {
        id: "debug-hud",
        name: "Show debug HUD",
        description: "Bottom-right debug panel (also enable with localStorage.rpDebug = '1'). Off by default. Share overlays stay on regardless.",
        action: {
          type: "switch",
          onChange: () => schedulePaint()
        }
      }
    ]
  });
}

// src/commands.js
var BLOCK_CTX_TREE_LABEL = `${BLOCK_CTX_LABEL} (+ children)`;
var BLOCK_CTX_SHARE_LABEL = "Roam Publish: Share settings\u2026";
var PAGE_CTX_SHARE_LABEL = "Roam Publish: Share settings\u2026";
async function alertPublishState(uid, label) {
  const state = uid ? checkPublishState(uid) : null;
  console.log("Roam Publish: check", label, uid, state);
  if (state) {
    const scope = state.kind === "block" ? `
Scope: ${scopeLabel(state.scope)}` : "";
    const teamNames = (state.groupNames && state.groupNames.length ? state.groupNames.join(", ") : null) || state.groupName;
    const team = teamNames ? `
Teams: ${teamNames}` : "";
    const dest = (state.teamDestinations && state.teamDestinations.length ? `
Destinations: ${state.teamDestinations.join(", ")}` : null) || (state.teamDestination ? `
Destination: ${state.teamDestination}` : "");
    notify(
      `${label} ${uid}
${state.kind} \xB7 ${statusLabel(state.status)} \xB7 ${visibilityLabel(
        state.visibility
      )}${scope}${team}${dest}${state.url ? `
${state.url}` : ""}`
    );
  } else {
    notify(`No publish record for ${uid || `(no ${label})`}`);
  }
}
async function openShareForKind(kind) {
  const target = await resolvePublishTarget({ kind });
  if (!target) return;
  openSharePopover(target.uid);
}
var COMMANDS = [
  {
    label: "Roam Publish: Publish Page",
    slash: true,
    palette: true,
    run: () => publish({ kind: "page" })
  },
  {
    label: "Roam Publish: Publish Block (this only)",
    slash: true,
    palette: true,
    run: () => publish({ kind: "block", scope: "self" })
  },
  {
    label: "Roam Publish: Publish Block (+ children)",
    slash: true,
    palette: true,
    run: () => publish({ kind: "block", scope: "tree" })
  },
  {
    label: "Roam Publish: Unpublish Page",
    slash: true,
    palette: true,
    run: () => unpublish({ kind: "page" })
  },
  {
    label: "Roam Publish: Unpublish Block",
    slash: true,
    palette: true,
    run: () => unpublish({ kind: "block" })
  },
  {
    label: "Roam Publish: Share settings\u2026",
    slash: true,
    palette: true,
    run: async () => {
      const focused = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      if (focused && publishCache.has(focused)) {
        openSharePopover(focused);
        return;
      }
      await openShareForKind("page");
    }
  },
  {
    label: "Roam Publish: Share settings for page\u2026",
    palette: true,
    run: () => openShareForKind("page")
  },
  {
    label: "Roam Publish: Share settings for block\u2026",
    palette: true,
    run: () => openShareForKind("block")
  },
  {
    label: "Roam Publish: Show published items",
    palette: true,
    run: () => openPublishedItemsDialog()
  },
  {
    label: "Roam Publish: Refresh status cache (dummy)",
    palette: true,
    run: () => refreshPublishCache()
  },
  {
    label: "Roam Publish: Log status cache",
    palette: true,
    run: () => {
      console.log("Roam Publish cache", Object.fromEntries(publishCache));
    }
  },
  {
    label: "Roam Publish: Check this page",
    slash: true,
    run: () => refreshCachedOpenUid().then((uid) => alertPublishState(uid, "page"))
  },
  {
    label: "Roam Publish: Check this block",
    slash: true,
    run: () => {
      const uid = window.roamAlphaAPI.ui.getFocusedBlock()?.["block-uid"];
      return alertPublishState(uid, "block");
    }
  }
];
var registeredSlash = [];
var registeredPalette = [];
var savedExtensionAPI = null;
function buildSettings2(extensionAPI2, _extension) {
  buildSettings(extensionAPI2);
}
function registerCommands(extensionAPI2, _extension) {
  savedExtensionAPI = extensionAPI2;
  registeredSlash = [];
  registeredPalette = [];
  for (const cmd of COMMANDS) {
    if (cmd.slash) {
      extensionAPI2.ui.slashCommand.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
          return "";
        }
      });
      registeredSlash.push(cmd.label);
    }
    if (cmd.palette) {
      extensionAPI2.ui.commandPalette.addCommand({
        label: cmd.label,
        callback: () => {
          void cmd.run();
        }
      });
      registeredPalette.push(cmd.label);
    }
  }
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_LABEL,
    callback: (ctx) => {
      void publish({ uid: ctx["block-uid"], kind: "block", scope: "self" });
    }
  });
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_TREE_LABEL,
    callback: (ctx) => {
      void publish({ uid: ctx["block-uid"], kind: "block", scope: "tree" });
    }
  });
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_SHARE_LABEL,
    callback: (ctx) => {
      openSharePopover(ctx["block-uid"]);
    }
  });
  window.roamAlphaAPI.ui.blockContextMenu.addCommand({
    label: BLOCK_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublish({ uid: ctx["block-uid"], kind: "block" });
    }
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_LABEL,
    callback: (ctx) => {
      void publish({ uid: ctx["page-uid"], kind: "page" });
    }
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_SHARE_LABEL,
    callback: (ctx) => {
      openSharePopover(ctx["page-uid"]);
    }
  });
  window.roamAlphaAPI.ui.pageContextMenu.addCommand({
    label: PAGE_CTX_UNPUBLISH_LABEL,
    callback: (ctx) => {
      void unpublish({ uid: ctx["page-uid"], kind: "page" });
    }
  });
}
function teardownCommands(extensionAPI2 = savedExtensionAPI) {
  for (const label of registeredSlash) {
    try {
      extensionAPI2?.ui?.slashCommand?.removeCommand?.({ label });
    } catch (_) {
    }
  }
  for (const label of registeredPalette) {
    try {
      extensionAPI2?.ui?.commandPalette?.removeCommand?.({ label });
    } catch (_) {
    }
  }
  registeredSlash = [];
  registeredPalette = [];
  for (const label of [
    BLOCK_CTX_LABEL,
    BLOCK_CTX_TREE_LABEL,
    BLOCK_CTX_SHARE_LABEL,
    BLOCK_CTX_UNPUBLISH_LABEL
  ]) {
    try {
      window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label });
    } catch (_) {
    }
  }
  for (const label of [
    PAGE_CTX_LABEL,
    PAGE_CTX_SHARE_LABEL,
    PAGE_CTX_UNPUBLISH_LABEL
  ]) {
    try {
      window.roamAlphaAPI.ui.pageContextMenu.removeCommand({ label });
    } catch (_) {
    }
  }
}

// src/watcher.js
var mutationPaintTimer = null;
var outdatedScanTimer = null;
function isOurOverlayNode(node) {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!(el instanceof Element)) return false;
  return Boolean(
    el.id === "rp-publish-layer" || el.id === "rp-publish-hud" || el.id === "rp-share-popover" || el.id === "rp-published-portal" || el.closest(
      "#rp-publish-layer, #rp-publish-hud, #rp-share-popover, #rp-published-portal, .rp-published-backdrop"
    )
  );
}
function schedulePaintFromMutation() {
  if (mutationPaintTimer) return;
  mutationPaintTimer = window.setTimeout(() => {
    mutationPaintTimer = null;
    schedulePaint();
  }, 400);
}
function scheduleOutdatedScan() {
  if (outdatedScanTimer) return;
  outdatedScanTimer = window.setTimeout(() => {
    outdatedScanTimer = null;
    try {
      scanAllForOutdated();
    } catch (err) {
      console.warn("Roam Publish: outdated scan failed", err);
    }
  }, 1200);
}
function startViewportWatcher() {
  stopViewportWatcher();
  scrubLegacyInTreeBadges();
  ensureOverlayRoots();
  const onScrollOrResize = () => schedulePaint();
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);
  const onFindOrCreateFocus = (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (t.id === "find-or-create-input" || t.closest(".rm-find-or-create-wrapper")) {
      schedulePaint();
    }
  };
  document.addEventListener("focusin", onFindOrCreateFocus);
  document.addEventListener("focusout", onFindOrCreateFocus);
  const mutation = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (isOurOverlayNode(m.target)) continue;
      const touched = [...m.addedNodes, ...m.removedNodes];
      if (touched.length && touched.every((n) => isOurOverlayNode(n))) {
        continue;
      }
      const overlayish = touched.some((n) => {
        if (!(n instanceof Element)) return false;
        return Boolean(
          n.matches?.(
            ".bp3-overlay, .bp3-popover, .bp3-transition-container, .rm-menu-item, .rm-omnibar, .rm-command-palette"
          ) || n.querySelector?.(
            ".bp3-overlay, .bp3-popover, .rm-menu-item, .rm-omnibar, .rm-command-palette"
          )
        );
      });
      if (overlayish) schedulePaint();
      else schedulePaintFromMutation();
      if (m.type === "characterData" || m.target instanceof Element && (m.target.closest?.(".rm-block__input") || m.target.closest?.(".rm-title-display") || m.target.classList?.contains("rm-block__input"))) {
        scheduleOutdatedScan();
      }
      break;
    }
  });
  const root = document.querySelector(".roam-app") || document.querySelector(".roam-body") || document.body;
  mutation.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });
  void refreshCachedOpenUid().then(() => schedulePaint());
  const openUidTick = window.setInterval(() => {
    void refreshCachedOpenUid().then(() => schedulePaint());
  }, 5e3);
  const outdatedTick = window.setInterval(() => {
    try {
      scanAllForOutdated();
    } catch (_) {
    }
  }, 15e3);
  setViewportWatcher({
    disconnect() {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("focusin", onFindOrCreateFocus);
      document.removeEventListener("focusout", onFindOrCreateFocus);
      mutation.disconnect();
      window.clearInterval(openUidTick);
      window.clearInterval(outdatedTick);
      if (mutationPaintTimer) {
        window.clearTimeout(mutationPaintTimer);
        mutationPaintTimer = null;
      }
      if (outdatedScanTimer) {
        window.clearTimeout(outdatedScanTimer);
        outdatedScanTimer = null;
      }
    }
  });
  schedulePaint();
}
function stopViewportWatcher() {
  viewportWatcher?.disconnect();
  setViewportWatcher(null);
}

// src/index.js
var unsubscribeCache = null;
function teardown() {
  stopViewportWatcher();
  teardownCommands();
  unsubscribeCache?.();
  unsubscribeCache = null;
  closeSharePopover();
  closePublishedItemsDialog();
  removeAllBadges();
  clearPublishCache();
  setExtensionAPI(null);
}
var index_default = {
  onload: ({ extensionAPI: extensionAPI2, extension }) => {
    console.log("loading version", extension.version);
    setExtensionAPI(extensionAPI2);
    buildSettings2(extensionAPI2, extension);
    registerCommands(extensionAPI2, extension);
    setOpenShareHandler((uid, ev) => {
      const anchor = ev.target instanceof Element ? ev.target.closest("[data-rp-open-share]") : null;
      openSharePopover(uid, {
        clientX: ev.clientX,
        clientY: ev.clientY,
        anchorRect: anchor?.getBoundingClientRect() ?? null
      });
    });
    unsubscribeCache = onCacheChange(() => {
      syncPublishStylesheet();
      schedulePaint();
      refreshSharePopoverIfOpen();
    });
    startViewportWatcher();
    void refreshPublishCache();
    return teardown;
  },
  onunload: teardown
};
export {
  index_default as default
};
