/**
 * Teams — each has a name and a publish destination (separate site/page).
 * Items can be shared to multiple teams.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   destination: string,
 *   permissions?: string,
 * }} ShareTeam
 */

/** @type {ShareTeam[]} */
export const DUMMY_TEAMS = [
  {
    id: "team-personal-blog",
    name: "Personal Blog",
    destination: "https://example.com/sites/personal-blog",
    permissions: "you can publish & manage",
  },
  {
    id: "team-work-docs",
    name: "Work Documents",
    destination: "https://example.com/sites/work-documents",
    permissions: "members can view & edit",
  },
];

/** @deprecated use DUMMY_TEAMS */
export const DUMMY_GROUPS = DUMMY_TEAMS;

export function listTeams() {
  return DUMMY_TEAMS.slice();
}

/** @deprecated use listTeams */
export function listGroups() {
  return listTeams();
}

/** @param {string | null | undefined} id */
export function getTeam(id) {
  if (!id) return null;
  return DUMMY_TEAMS.find((t) => t.id === id) || null;
}

/** @deprecated use getTeam */
export function getGroup(id) {
  return getTeam(id);
}

/**
 * Normalize to a unique list of known team ids (preserves order).
 * Accepts legacy single id / teamIds / groupIds.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeGroupIds(raw) {
  /** @type {unknown[]} */
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string" && raw) list = [raw];

  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const item of list) {
    const id = typeof item === "string" ? item : null;
    if (!id || seen.has(id) || !getTeam(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** @param {string | null | undefined} id */
export function teamNameFor(id) {
  return getTeam(id)?.name || null;
}

/** @deprecated use teamNameFor */
export function groupNameFor(id) {
  return teamNameFor(id);
}

/** @param {string | null | undefined} id */
export function teamDestinationFor(id) {
  return getTeam(id)?.destination || null;
}

/** @param {string[]} ids */
export function teamNamesFor(ids) {
  return normalizeGroupIds(ids)
    .map((id) => teamNameFor(id))
    .filter(Boolean);
}

/** @param {string[]} ids */
export function teamDestinationsFor(ids) {
  return normalizeGroupIds(ids)
    .map((id) => teamDestinationFor(id))
    .filter(Boolean);
}

/** Human-readable summary for lists / tooltips. */
export function formatTeamsLabel(ids) {
  const names = teamNamesFor(ids);
  if (!names.length) return null;
  return names.join(", ");
}

/** Multi-line / meta destination summary. */
export function formatTeamsDestinations(ids) {
  const normalized = normalizeGroupIds(ids);
  if (!normalized.length) return null;
  return normalized
    .map((id) => {
      const t = getTeam(id);
      return t ? `${t.name} → ${t.destination}` : null;
    })
    .filter(Boolean)
    .join("; ");
}
