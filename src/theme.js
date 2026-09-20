/** Shared status, scope, visibility, and share-label helpers. */

/** @typedef {"published" | "outdated" | "draft"} PublishStatus */
/** @typedef {"self" | "tree"} PublishScope */
/** @typedef {"private" | "unlisted" | "public"} PublishVisibility */

/**
 * @typedef {{
 *   status: PublishStatus,
 *   kind: "page" | "block",
 *   scope?: PublishScope,
 *   visibility: PublishVisibility,
 *   title?: string,
 *   url?: string,
 *   publishedAt?: string,
 *   contentFingerprint?: string,
 *   graphName?: string,
 * }} PublishEntry
 */

/**
 * @type {Record<PublishStatus, {
 *   label: string,
 *   badgeClass: string,
 *   ring: string,
 *   tint: string,
 *   treeBorder: string,
 *   tagIntent: string,
 * }>}
 */
export const STATUS_THEME = {
  published: {
    label: "Published",
    badgeClass: "rp-publish-badge rp-publish-badge--published bp3-tag bp3-intent-success",
    ring: "rgba(15, 128, 70, 0.45)",
    tint: "rgba(15, 128, 70, 0.07)",
    treeBorder: "rgba(15, 128, 70, 0.35)",
    tagIntent: "bp3-intent-success",
  },
  outdated: {
    label: "Outdated",
    badgeClass: "rp-publish-badge rp-publish-badge--outdated bp3-tag bp3-intent-warning",
    ring: "rgba(180, 110, 0, 0.5)",
    tint: "rgba(180, 110, 0, 0.08)",
    treeBorder: "rgba(180, 110, 0, 0.4)",
    tagIntent: "bp3-intent-warning",
  },
  draft: {
    label: "Draft",
    badgeClass: "rp-publish-badge rp-publish-badge--draft bp3-tag",
    ring: "rgba(80, 90, 110, 0.45)",
    tint: "rgba(80, 90, 110, 0.07)",
    treeBorder: "rgba(80, 90, 110, 0.35)",
    tagIntent: "",
  },
};

/** @type {Record<PublishScope, { label: string, short: string }>} */
export const SCOPE_THEME = {
  self: { label: "This block only", short: "self" },
  tree: { label: "Block + children", short: "tree" },
};

/** @type {Record<PublishVisibility, { label: string, short: string }>} */
export const VISIBILITY_THEME = {
  private: { label: "Private", short: "private" },
  unlisted: { label: "Unlisted", short: "unlisted" },
  public: { label: "Public", short: "public" },
};

/** @param {string | undefined | null} status @returns {PublishStatus} */
export function normalizeStatus(status) {
  if (status === "outdated" || status === "draft") return status;
  return "published";
}

/** @param {string | undefined | null} scope @returns {PublishScope} */
export function normalizeScope(scope) {
  return scope === "tree" ? "tree" : "self";
}

/** @param {string | undefined | null} visibility @returns {PublishVisibility} */
export function normalizeVisibility(visibility) {
  if (visibility === "private" || visibility === "public") return visibility;
  return "unlisted";
}

/** @param {string | undefined | null} status */
export function statusLabel(status) {
  return STATUS_THEME[normalizeStatus(status)].label;
}

/** @param {string | undefined | null} status */
export function statusBadgeClass(status) {
  return STATUS_THEME[normalizeStatus(status)].badgeClass;
}

/** @param {string | undefined | null} status */
export function statusTagClass(status) {
  const theme = STATUS_THEME[normalizeStatus(status)];
  return ["bp3-tag", "bp3-minimal", theme.tagIntent].filter(Boolean).join(" ");
}

/** @param {string | undefined | null} scope */
export function scopeLabel(scope) {
  return SCOPE_THEME[normalizeScope(scope)].label;
}

/** @param {string | undefined | null} scope */
export function scopeShort(scope) {
  return SCOPE_THEME[normalizeScope(scope)].short;
}

/** @param {string | undefined | null} visibility */
export function visibilityLabel(visibility) {
  return VISIBILITY_THEME[normalizeVisibility(visibility)].label;
}

/** @param {string | undefined | null} iso */
export function formatPublishedAt(iso) {
  if (!iso) return "Never published";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * @param {Partial<PublishEntry>} entry
 */
export function entryTitleAttr(entry) {
  const parts = [statusLabel(entry.status)];
  if (entry.kind === "block") parts.push(scopeLabel(entry.scope));
  parts.push(visibilityLabel(entry.visibility));
  if (entry.url) parts.push(entry.url);
  return parts.join(" · ");
}
