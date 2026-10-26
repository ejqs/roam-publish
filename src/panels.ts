import { api, ApiError } from "./api";
import { addToCollection, cacheListing, collectionOptions, statusView, syncPublications } from "./publish";
import { getCache, getServer, type Listing, type Visibility } from "./state";
import { toast } from "./toast";
import { button, callout, dialog, h, openUrl, segmented, selectField, switchField, textField } from "./ui";

/**
 * Page settings, Collection settings and the dashboard, all drawn by the extension and filled from
 * roam.pub. roam.pub decides which choices are allowed and says why one isn't (from the same rules as
 * the website), so nothing here re-implements them. Access, passwords and members stay on roam.pub.
 */

type Access = "open" | "password" | "members";
type Own<T extends string> = "inherit" | T;

type PlaceSettings = {
  listing: Listing;
  discoverBlocked: string | null;
  access: Access;
  showAuthor: Own<"show" | "hide">;
  views: Own<"show" | "hide" | "off">;
  pdfDownload: Own<"on" | "off">;
  /** What "inherit" means there. */
  defaults: { showAuthor: "show" | "hide"; views: "show" | "hide" | "off"; pdfDownload: "on" | "off" };
};

type PageSettings = {
  encrypted: boolean;
  manageUrl: string;
  graph: PlaceSettings & { name: string; inGraph: boolean; url: string; listingBlocked: string | null };
  collections: (PlaceSettings & { id: string; name: string; url: string; canManage: boolean })[];
};

type CollectionSettings = {
  id: string;
  name: string;
  description: string;
  url: string;
  settingsUrl: string;
  role: "owner" | "member";
  canEdit: boolean;
  indexAccess: Access;
  defaultAccess: Access;
  hasPassword: boolean;
  encryptNewPages: boolean;
  showAuthors: boolean;
  showVisibility: boolean;
  views: "show" | "hide" | "off";
  showViewCountries: boolean;
  pdfDownload: boolean;
  indexable: boolean;
  searchListed: boolean;
  featured: boolean;
  discoverable: boolean;
  rss: boolean;
  pagesLeaveGraph: boolean;
  discoverBlocked: string | null;
  featuredBlocked: string | null;
};

type Stats = {
  period: Period;
  from: string;
  dailySince: string | null;
  pages: number;
  blocks: number;
  encrypted: number;
  views: { total: number; period: number; byDay: { day: string; views: number }[] };
  upvotes: { total: number; period: number };
  countries: { code: string; views: number }[];
  top: { rootUid: string; kind: "page" | "block"; title: string; encrypted: boolean; url: string; views: number; upvotes: number }[];
  firstPublishedAt: string | null;
  publishingDays: number;
  collections: { id: string; name: string; url: string; role: "owner" | "member"; pages: number }[];
};

type Period = "7" | "30" | "all";

const ACCESS_LABEL: Record<Access, string> = { open: "Open", password: "Password", members: "Members only" };
const LISTING_LABEL: Record<Listing, string> = { unlisted: "Unlisted", listed: "Public", discover: "On Discover" };
const SHOWN: Record<string, string> = { show: "Shown", hide: "Hidden", off: "Off", on: "On" };

const enc = encodeURIComponent;
const errorText = (e: unknown) =>
  e instanceof ApiError && e.status === 404 && /Request failed/.test(e.message)
    ? "roam.pub doesn't have this yet. Try again after it updates."
    : e instanceof Error
      ? e.message
      : "Something went wrong.";

const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: iso.length === 10 ? "UTC" : undefined });
const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

const listingNote = (l: Listing, where: "graph" | "collection") =>
  l === "unlisted" ? "Only people with the link find it." : `Shown on the ${where === "graph" ? "graph's front page" : "collection's page"}${l === "discover" ? " and on Discover" : ""}.`;

/** A labelled row of the compact settings form. */
const formRow = (label: string, ...field: (Node | string | null)[]) =>
  h("div", { class: "rp-form-row" }, h("div", { class: "rp-form-label" }, label), h("div", { class: "rp-form-field" }, ...field));

/** The page's own settings in one place, as form rows; `read` gives what changed. */
function placeFields(p: PlaceSettings, where: "graph" | "collection", opts: { listingBlocked?: string | null; disabled?: boolean }) {
  const as = where === "graph" ? "As the graph" : "As the collection";
  const listing = opts.listingBlocked
    ? null
    : segmented(
        "Visibility",
        (["unlisted", "listed", "discover"] as const).map((v) => ({
          value: v,
          label: LISTING_LABEL[v],
          disabled: opts.disabled ? "Not yours to change" : v === "discover" ? p.discoverBlocked : null,
        })),
        p.listing,
      );
  const own = (label: string, value: string, inherit: string, choices: [string, string][]) =>
    selectField(label, [{ value: "inherit", label: `${as} (${SHOWN[inherit]})` }, ...choices.map(([v, l]) => ({ value: v, label: l }))], value, {
      disabled: opts.disabled,
      bare: true,
    });
  const byline = own("Byline", p.showAuthor, p.defaults.showAuthor, [["show", "Show"], ["hide", "Hide"]]);
  const views = own("View count", p.views, p.defaults.views, [["show", "Show"], ["hide", "Only for you"], ["off", "Off"]]);
  const pdf = own("PDF download", p.pdfDownload, p.defaults.pdfDownload, [["on", "On"], ["off", "Off"]]);
  const rows = [
    listing ? formRow("Visibility", listing.group, h("div", { class: "rp-note" }, listingNote(p.listing, where))) : null,
    formRow("Byline", byline.row),
    formRow("View count", views.row),
    formRow("PDF download", pdf.row),
  ];
  const read = () => {
    const out: Record<string, string> = {};
    if (listing && listing.get() !== p.listing) out.listing = listing.get();
    if (byline.get() !== p.showAuthor) out.showAuthor = byline.get();
    if (views.get() !== p.views) out.views = views.get();
    if (pdf.get() !== p.pdfDownload) out.pdfDownload = pdf.get();
    return out;
  };
  return { rows: rows.filter((r): r is HTMLDivElement => !!r), read };
}

/**
 * The Settings tab of the title icons' pop-up: the page's settings in its graph, its collections
 * (each opens its own small dialog) and its access, which is changed on roam.pub.
 */
export async function renderPageSettings(root: HTMLElement, uid: string, onChange: () => void) {
  root.replaceChildren(h("div", { class: "rp-muted" }, "Loading settings…"));
  let s: PageSettings;
  try {
    s = await api<PageSettings>(`/api/ext/publications/${enc(uid)}/settings`);
  } catch (e) {
    root.replaceChildren(callout(errorText(e), "danger"));
    return;
  }
  if (!root.isConnected) return;
  const status = h("div", { class: "rp-status", role: "status" });
  const f = s.graph.inGraph ? placeFields(s.graph, "graph", { listingBlocked: s.graph.listingBlocked }) : null;

  const collections = s.collections.map((c) =>
    h(
      "div",
      { class: "rp-list-row" },
      h("span", { title: `${ACCESS_LABEL[c.access]}, ${LISTING_LABEL[c.listing]}` }, c.name, h("span", { class: "rp-muted" }, ` · ${LISTING_LABEL[c.listing]}`)),
      button("Edit…", () => openEntrySettings(uid, c, () => (onChange(), void renderPageSettings(root, uid, onChange))), { minimal: true }),
    ),
  );
  const add = h("div", {});
  void addToCollectionField(add, uid, () => (onChange(), void renderPageSettings(root, uid, onChange)));

  const save = button(
    "Save",
    async () => {
      const body = f?.read() ?? {};
      if (!Object.keys(body).length) return void toast("Nothing changed.");
      save.disabled = true;
      status.replaceChildren();
      try {
        const res = await api<{ visibility: Visibility; listing?: Listing; url: string }>(`/api/ext/publications/${enc(uid)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        if (body.listing) await cacheListing(uid, res);
        toast("Settings saved.", { intent: "success" });
        onChange();
        void renderPageSettings(root, uid, onChange);
      } catch (e) {
        status.replaceChildren(callout(errorText(e), "danger"));
        save.disabled = false;
      }
    },
    { intent: "primary", disabled: !f },
  );

  root.replaceChildren(
    ...(f ? f.rows : [formRow("Visibility", h("span", { class: "rp-muted" }, `Not in ${s.graph.name}, only in collections.`))]),
    formRow("Collections", ...(collections.length ? collections : [h("div", { class: "rp-muted" }, "None")]), add),
    formRow(
      "Access",
      h("div", {}, ACCESS_LABEL[s.graph.access], s.encrypted ? ", encrypted" : ""),
      h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), openUrl(s.manageUrl)) }, "Change on roam.pub ↗"),
    ),
    status,
    h("div", { class: "rp-row rp-row-end" }, save),
  );
}

/** A collection picker inside the Settings tab: choose one, then Add. Nothing shows without collections to add to. */
async function addToCollectionField(root: HTMLElement, uid: string, onAdded: () => void) {
  let options: Awaited<ReturnType<typeof collectionOptions>>;
  try {
    options = await collectionOptions(uid);
  } catch {
    return;
  }
  if (!root.isConnected || !options.some((o) => !o.disabled)) return;
  const field = selectField("Add to collection", [{ value: "", label: "Add to collection…" }, ...options.map((o) => ({ value: o.value, label: o.label }))], "", {
    bare: true,
  });
  const select = field.row.querySelector("select")!;
  // A disabled option already says why in its label ("already there").
  select.querySelectorAll("option").forEach((o, i) => (o.disabled = i > 0 && options[i - 1].disabled));
  const add = button(
    "Add",
    async () => {
      if (!field.get()) return;
      add.disabled = true;
      await addToCollection(uid, field.get());
      onAdded();
    },
    { disabled: true },
  );
  select.addEventListener("change", () => (add.disabled = !field.get()));
  root.replaceChildren(h("div", { class: "rp-inline" }, field.row, add));
}

/** The page's settings in one of its collections, and taking it out of that collection. */
function openEntrySettings(uid: string, c: PageSettings["collections"][number], onChange: () => void) {
  const d = dialog(`In ${c.name}`);
  const f = placeFields(c, "collection", { disabled: !c.canManage });
  const status = h("div", { class: "rp-status", role: "status" });
  d.body.append(
    ...f.rows,
    formRow("Access", h("div", {}, ACCESS_LABEL[c.access])),
    formRow(
      "",
      h(
        "div",
        { class: "rp-links" },
        h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), void openCollectionSettings(c.id)) }, "Collection settings…"),
        h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), openUrl(c.url)) }, "Open in collection ↗"),
      ),
    ),
    c.canManage ? "" : callout("Only the collection's owner or the member who added the page changes these."),
    status,
  );
  let confirming = false;
  const remove = button(
    "Remove",
    async () => {
      if (!confirming) {
        confirming = true;
        remove.textContent = `Remove from ${c.name}?`;
        return;
      }
      remove.disabled = true;
      try {
        await api(`/api/ext/publications/${enc(uid)}/collections/${enc(c.id)}`, { method: "DELETE" });
        await syncPublications({ quiet: true });
        toast(`Removed from ${c.name}.`, { intent: "success" });
        d.close();
        onChange();
      } catch (e) {
        status.replaceChildren(callout(errorText(e), "danger"));
        remove.disabled = false;
      }
    },
    { minimal: true, intent: "danger", small: false, disabled: !c.canManage },
  );
  const save = button(
    "Save",
    async () => {
      const body = f.read();
      if (!Object.keys(body).length) return d.close();
      save.disabled = true;
      try {
        await api(`/api/ext/publications/${enc(uid)}/collections/${enc(c.id)}`, { method: "PATCH", body: JSON.stringify(body) });
        toast("Settings saved.", { intent: "success" });
        d.close();
        onChange();
      } catch (e) {
        status.replaceChildren(callout(errorText(e), "danger"));
        save.disabled = false;
      }
    },
    { intent: "primary", small: false, disabled: !c.canManage },
  );
  d.footer.append(
    remove,
    h("span", { class: "rp-spacer" }),
    button("Cancel", d.close, { small: false }),
    save,
  );
}

type PageStats = Pick<Stats, "views" | "upvotes" | "countries">;

/** The page's views, upvotes and readers' countries as three tiles, or nothing if roam.pub can't say. */
export async function renderPageStats(root: HTMLElement, uid: string) {
  let s: PageStats;
  try {
    s = await api<PageStats>(`/api/ext/publications/${enc(uid)}/stats?period=7`);
  } catch {
    root.replaceChildren();
    return;
  }
  if (!root.isConnected) return;
  const countries = s.countries.filter((c) => c.code !== "other");
  const tile = (label: string, value: number, gained?: number) =>
    h(
      "div",
      { class: "rp-tile rp-tile-small" },
      h("div", { class: "rp-tile-value" }, count(value)),
      h("div", { class: "rp-tile-label" }, label),
      gained === undefined ? "" : h("div", { class: `rp-note${gained ? " rp-gain" : ""}` }, `+${count(gained)} in 7 days`),
    );
  root.replaceChildren(
    h("div", { class: "rp-tiles rp-tiles-3" }, tile("Views", s.views.total, s.views.period), tile("Upvotes", s.upvotes.total, s.upvotes.period), tile("Countries", countries.length)),
  );
}

/** A collection's own settings: its owner changes them, members see them. */
export async function openCollectionSettings(id: string) {
  const d = dialog("Collection settings");
  d.body.append(h("div", { class: "rp-muted" }, "Loading…"));
  let c: CollectionSettings;
  try {
    c = await api<CollectionSettings>(`/api/ext/collections/${enc(id)}`);
  } catch (e) {
    d.body.replaceChildren(callout(errorText(e), "danger"));
    d.footer.append(button("Close", d.close, { small: false }));
    return;
  }
  if (!d.isOpen()) return;
  const off = !c.canEdit;
  const name = textField("Name", c.name, { disabled: off, maxLength: 80 });
  const description = textField("Description", c.description, { multiline: true, disabled: off });
  const views = selectField(
    "View count",
    [
      { value: "show", label: "Shown" },
      { value: "hide", label: "Only for the people who manage each page" },
      { value: "off", label: "Off" },
    ],
    c.views,
    { disabled: off },
  );
  const sw = (label: string, value: boolean, blocked?: string | null) => switchField(label, value, { disabled: off || blocked || undefined });
  const fields = {
    showAuthors: sw("Bylines", c.showAuthors),
    showVisibility: sw("Public and Discover labels on pages", c.showVisibility),
    showViewCountries: sw("Reader countries with view counts", c.showViewCountries),
    pdfDownload: sw("Download PDF", c.pdfDownload),
    indexable: sw("Search engines", c.indexable),
    searchListed: sw("roam.pub search", c.searchListed),
    discoverable: sw("Collection on Discover", c.discoverable, c.discoverBlocked),
    featured: sw("New pages start on Discover", c.featured, c.featuredBlocked),
    rss: sw("RSS feed", c.rss),
    pagesLeaveGraph: sw("Take added pages out of their graph", c.pagesLeaveGraph),
  };
  const status = h("div", { class: "rp-status", role: "status" });
  d.body.replaceChildren(
    h("div", { class: "rp-section-head" }, h("strong", {}, c.name), button("Open ↗", () => openUrl(c.url), { minimal: true })),
    name.row,
    description.row,
    views.row,
    ...Object.values(fields).map((f) => f.row),
    h(
      "div",
      { class: "rp-note" },
      `Access to the collection's page: ${ACCESS_LABEL[c.indexAccess]}. New pages: ${ACCESS_LABEL[c.defaultAccess]}${c.encryptNewPages ? ", encrypted" : ""}. Access, passwords and members are changed on roam.pub.`,
    ),
    off ? callout("Only the collection's owner changes its settings.") : "",
    status,
  );
  const save = button(
    "Save",
    async () => {
      const body: Record<string, unknown> = {};
      if (name.get() !== c.name) body.name = name.get();
      if (description.get() !== c.description) body.description = description.get();
      if (views.get() !== c.views) body.views = views.get();
      for (const [k, f] of Object.entries(fields)) if (f.get() !== c[k as keyof typeof fields]) body[k] = f.get();
      if (!Object.keys(body).length) return d.close();
      save.disabled = true;
      try {
        await api(`/api/ext/collections/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) });
        toast(`Saved ${String(body.name ?? c.name)}.`, { intent: "success" });
        d.close();
      } catch (e) {
        status.replaceChildren(callout(errorText(e), "danger"));
        save.disabled = false;
      }
    },
    { intent: "primary", small: false, disabled: off },
  );
  d.footer.append(button("Access and members on roam.pub ↗", () => openUrl(c.settingsUrl), { minimal: true, small: false }), button("Cancel", d.close, { small: false }), save);
}

const countryNames = new Intl.DisplayNames(undefined, { type: "region" });
const countryName = (code: string) => {
  if (code === "other") return "Other";
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Opens a published page or block in Roam's main window. */
function openInRoam(uid: string, kind: "page" | "block") {
  const w = window.roamAlphaAPI.ui.mainWindow;
  void (kind === "page" ? w.openPage({ page: { uid } }) : w.openBlock({ block: { uid } }));
}

const PERIOD_LABEL: Record<Period, string> = { "7": "7 days", "30": "30 days", all: "All time" };
let period: Period = "30";

/** The Roam Publish dashboard: views, pages, upvotes, readers' countries and collections, from roam.pub. */
export function openDashboard() {
  const d = dialog("Roam Publish", { wide: true });
  const periods = h("div", { class: "bp3-button-group bp3-small rp-periods", role: "group", "aria-label": "Period" });
  const content = h("div", {});
  const draw = () => {
    periods.replaceChildren(
      ...(Object.keys(PERIOD_LABEL) as Period[]).map((p) => {
        const b = button(PERIOD_LABEL[p], () => {
          period = p;
          draw();
        });
        if (p === period) b.classList.add("bp3-active");
        b.setAttribute("aria-pressed", String(p === period));
        return b;
      }),
    );
    void fill(content, d.isOpen);
  };
  d.body.append(periods, content);
  d.footer.append(
    button("Open dashboard on roam.pub ↗", () => openUrl(`${getServer()}/dashboard`), { minimal: true, small: false }),
    button("Close", d.close, { small: false }),
  );
  draw();
}

async function fill(root: HTMLElement, isOpen: () => boolean) {
  const asked = period;
  root.replaceChildren(h("div", { class: "rp-muted" }, "Loading…"));
  let s: Stats;
  try {
    s = await api<Stats>(`/api/ext/stats?period=${asked}`);
  } catch (e) {
    root.replaceChildren(callout(errorText(e), "danger"));
    return;
  }
  if (!isOpen() || asked !== period) return;
  const cache = getCache();
  const titleOf = (t: Stats["top"][number]) => cache[t.rootUid]?.title || t.title;
  const inPeriod = asked === "all" ? "" : ` in the last ${PERIOD_LABEL[asked]}`;
  const top = s.countries.filter((c) => c.code !== "other");
  const tile = (label: string, value: string, sub: string) =>
    h("div", { class: "rp-tile" }, h("div", { class: "rp-tile-value" }, value), h("div", { class: "rp-tile-label" }, label), h("div", { class: "rp-note" }, sub));

  const max = Math.max(1, ...s.views.byDay.map((d) => d.views));
  const chart = h(
    "div",
    { class: "rp-chart", role: "img", "aria-label": `Views per day, ${count(s.views.period)} in all` },
    ...s.views.byDay.map((d) =>
      h("div", { class: "rp-bar", title: `${date(d.day)}: ${plural(d.views, "view")}`, style: `height: ${Math.max(2, Math.round((d.views / max) * 100))}%` }),
    ),
  );
  const since = s.dailySince && s.dailySince > s.from ? `Counted by day since ${date(s.dailySince)}.` : "";

  const changed = h("div", {}, h("div", { class: "rp-muted" }, "Checking your pages…"));
  root.replaceChildren(
    h(
      "div",
      { class: "rp-tiles" },
      tile("Views", count(asked === "all" ? s.views.total : s.views.period), asked === "all" ? "All time" : `${count(s.views.total)} all time`),
      tile("Published", count(s.pages + s.blocks), `${plural(s.pages, "page")}, ${plural(s.blocks, "block")}`),
      tile("Upvotes", count(asked === "all" ? s.upvotes.total : s.upvotes.period), asked === "all" ? "On Discover" : `${count(s.upvotes.total)} all time`),
      tile("Countries", count(top.length), top[0] ? `Most from ${countryName(top[0].code)}` : "No readers counted yet"),
    ),
    h("h6", { class: "bp3-heading rp-heading" }, `Views per day${asked === "all" ? ", last 90 days" : ""}`),
    chart,
    h("div", { class: "rp-note" }, `Pages with view counts off aren't counted. ${since}`.trim()),
    h("h6", { class: "bp3-heading rp-heading" }, "Most read"),
    s.top.length
      ? h(
          "div",
          { class: "rp-list" },
          ...s.top.map((t) =>
            h(
              "div",
              { class: "rp-list-row" },
              h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), openInRoam(t.rootUid, t.kind)) }, titleOf(t)),
              h("span", { class: "rp-muted" }, `${plural(t.views, "view")}${t.upvotes ? ` · ${plural(t.upvotes, "upvote")}` : ""}`),
              button("Open ↗", () => openUrl(t.url), { minimal: true }),
            ),
          ),
        )
      : h("div", { class: "rp-muted" }, "No views yet."),
    h("h6", { class: "bp3-heading rp-heading" }, "Changed since published"),
    changed,
    h("h6", { class: "bp3-heading rp-heading" }, "Collections"),
    s.collections.length
      ? h(
          "div",
          { class: "rp-list" },
          ...s.collections.map((c) =>
            h(
              "div",
              { class: "rp-list-row" },
              h("span", {}, c.name),
              h("span", { class: "rp-muted" }, `${plural(c.pages, "page")}${c.role === "member" ? " · member" : ""}`),
              h("span", {}, button("Settings", () => void openCollectionSettings(c.id), { minimal: true }), button("Open ↗", () => openUrl(c.url), { minimal: true })),
            ),
          ),
        )
      : h("div", { class: "rp-muted" }, "You're not in any collections."),
    h(
      "div",
      { class: "rp-note rp-foot" },
      s.firstPublishedAt
        ? `First published ${date(s.firstPublishedAt)}. Published on ${plural(s.publishingDays, "day")}${inPeriod}.`
        : "Nothing published yet.",
    ),
  );
  void listChanged(changed, isOpen);
}

/** Pages to hash for "Changed since published"; past this the list says it stopped. */
const MAX_CHECKED = 100;

/** Pages and blocks of yours that changed in Roam since they were published, checked one at a time. */
async function listChanged(root: HTMLElement, isOpen: () => boolean) {
  const mine = Object.entries(getCache()).filter(([, c]) => c.mine !== false && !c.removed);
  const rows: HTMLElement[] = [];
  for (const [uid] of mine.slice(0, MAX_CHECKED)) {
    if (!isOpen()) return;
    // Yield between pages, so hashing never holds up typing in Roam.
    await new Promise((r) => setTimeout(r, 0));
    const view = await statusView(uid, { sync: false }).catch(() => null);
    if (view?.state !== "changed") continue;
    const kind = view.kind;
    // The same Republish the status offers, which keeps the published open and collapsed blocks.
    const republish = view.actions.find((a) => a.label === "Republish");
    rows.push(
      h(
        "div",
        { class: "rp-list-row" },
        h("a", { class: "rp-link", href: "#", onclick: (e: Event) => (e.preventDefault(), openInRoam(uid, kind)) }, view.c?.title ?? uid),
        h("span", { class: "rp-muted" }, `Last published ${date(view.c!.updatedAt)}`),
        republish ? button("Republish", republish.onClick, { minimal: true, intent: "primary" }) : null,
      ),
    );
  }
  if (!isOpen()) return;
  const more = mine.length > MAX_CHECKED ? h("div", { class: "rp-note" }, `Checked the first ${count(MAX_CHECKED)} of ${count(mine.length)}.`) : null;
  root.replaceChildren(rows.length ? h("div", { class: "rp-list" }, ...rows) : h("div", { class: "rp-muted" }, "Everything is up to date."), more ?? "");
}

