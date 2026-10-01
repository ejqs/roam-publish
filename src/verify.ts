import { api, ApiError } from "./api";
import { syncPublications } from "./publish";
import { getApiKey, getServer, setApiKey } from "./state";
import { toast } from "./toast";

const CODE = /verify-roam-publish[^:]*:\s*([A-Za-z0-9_-]{43})/;
const POLL_MS = 5000;
const POLL_FOR_MS = 15 * 60 * 1000;

let pollTimer: number | undefined;
const triedCodes = new Set<string>();

/** Verification codes found on the daily notes around today (newest page first). */
async function findCodes(): Promise<string[]> {
  const { util, data } = window.roamAlphaAPI;
  const day = 24 * 60 * 60 * 1000;
  const pages = [0, -1, 1].map((d) => util.dateToPageUid(new Date(Date.now() + d * day)));
  const codes: string[] = [];
  for (const pageUid of pages) {
    const rows: [string][] = await data.async.q(
      `[:find ?s :in $ ?p :where [?page :block/uid ?p] [?b :block/page ?page] [?b :block/string ?s]
        [(clojure.string/includes? ?s "verify-roam-publish")]]`,
      pageUid,
    );
    for (const [s] of rows ?? []) {
      const m = CODE.exec(s);
      if (m) codes.push(m[1]);
    }
  }
  return codes;
}

/** Try every unseen code. Returns true once the graph is connected. */
export async function tryClaim(opts: { manual?: boolean } = {}): Promise<boolean> {
  const codes = (await findCodes()).filter((c) => opts.manual || !triedCodes.has(c));
  if (codes.length === 0) {
    if (opts.manual) toast("No verification block found on today's daily note yet. Finish the steps on the website first.");
    return false;
  }
  for (const code of codes) {
    triedCodes.add(code);
    try {
      const { apiKey } = await api<{ apiKey: string }>("/api/ext/claim", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ graphName: window.roamAlphaAPI.graph.name, code }),
      });
      await setApiKey(apiKey);
      stopPolling();
      toast("Roam Publish is connected! Right-click a page or block to publish.", { intent: "success" });
      toast(
        "You can now delete the append-only API token (Settings → Graph → API tokens) and the verification block on today's daily note. Roam Publish doesn't need them anymore.",
        { durationMs: 15000 },
      );
      await syncPublications({ quiet: true }).catch(() => {});
      return true;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        if (opts.manual || e instanceof ApiError) toast((e as Error).message, { intent: "danger" });
        if (e instanceof ApiError && e.status === 429) return false;
      }
    }
  }
  if (opts.manual) toast("That verification code expired or was already used. Start again on the website.", { intent: "danger" });
  return false;
}

export function startPolling() {
  stopPolling();
  const until = Date.now() + POLL_FOR_MS;
  pollTimer = window.setInterval(async () => {
    if (Date.now() > until) return stopPolling();
    await tryClaim().catch(() => {});
  }, POLL_MS);
}

export function stopPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  pollTimer = undefined;
}

export function openLogin() {
  const { graph } = window.roamAlphaAPI;
  const next = `/onboarding?graph=${encodeURIComponent(graph.name)}`;
  window.open(`${getServer()}/login?next=${encodeURIComponent(next)}`, "_blank", "noopener");
  if (getApiKey()) toast("This graph is already connected. Continuing will connect it again.");
  startPolling();
}
