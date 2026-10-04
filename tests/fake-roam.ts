/**
 * A tiny in-memory Roam graph behind the parts of window.roamAlphaAPI the extension uses. Blocks are
 * keyed by uid; pages have a title. `pull` answers `[:block/uid "x"]` and `[:node/title "x"]`.
 */
type Block = { uid: string; string?: string; title?: string; order?: number; heading?: number; align?: string; view?: string; children?: Block[] };

export function fakeRoam(pages: Block[]) {
  const byUid = new Map<string, Block>();
  const index = (b: Block) => {
    byUid.set(b.uid, b);
    b.children?.forEach((c, i) => index({ ...c, order: c.order ?? i }) ?? Object.assign(c, { order: c.order ?? i }));
  };
  const add = (b: Block) => {
    byUid.set(b.uid, b);
    b.children?.forEach((c, i) => {
      c.order ??= i;
      add(c);
    });
  };
  void index;
  pages.forEach(add);

  const toPull = (b: Block): Record<string, unknown> => ({
    ":block/uid": b.uid,
    ...(b.string !== undefined && { ":block/string": b.string }),
    ...(b.title !== undefined && { ":node/title": b.title }),
    ":block/order": b.order ?? 0,
    ...(b.heading && { ":block/heading": b.heading }),
    ...(b.align && { ":block/text-align": b.align }),
    ...(b.view && { ":children/view-type": b.view }),
    ...(b.children?.length && { ":block/children": b.children.map(toPull) }),
  });

  const pull = async (_pattern: string, eid: string) => {
    const uid = /^\[:block\/uid "(.+)"\]$/.exec(eid)?.[1];
    if (uid) return byUid.has(uid) ? toPull(byUid.get(uid)!) : null;
    const title = /^\[:node\/title "(.+)"\]$/.exec(eid)?.[1]?.replace(/\\(.)/g, "$1");
    const page = [...byUid.values()].find((b) => b.title === title);
    return page ? toPull(page) : null;
  };

  const parentOf = (uid: string) => [...byUid.values()].find((b) => b.children?.some((c) => c.uid === uid));
  const renumber = (b: Block) => b.children?.forEach((c, i) => (c.order = i));
  let nextUid = 0;
  const block = {
    async create({ location, block: nb }: { location: { "parent-uid": string; order: number | "last" }; block: Block }) {
      const parent = byUid.get(location["parent-uid"])!;
      const kids = (parent.children ??= []);
      kids.splice(location.order === "last" ? kids.length : location.order, 0, { ...nb });
      byUid.set(nb.uid, kids.find((k) => k.uid === nb.uid)!);
      renumber(parent);
    },
    async update({ block: b }: { block: { uid: string; string: string } }) {
      byUid.get(b.uid)!.string = b.string;
    },
    async delete({ block: b }: { block: { uid: string } }) {
      const parent = parentOf(b.uid);
      if (parent) parent.children = parent.children!.filter((c) => c.uid !== b.uid);
      byUid.delete(b.uid);
      if (parent) renumber(parent);
    },
  };

  (globalThis as unknown as { window: unknown }).window = {
    roamAlphaAPI: {
      data: { async: { pull }, block },
      graph: { name: "test-graph" },
      util: { generateUID: () => `gen${String(nextUid++).padStart(6, "0")}` },
    },
  };
  return { blocks: byUid };
}
