// Minimal types for the parts of roamAlphaAPI / extensionAPI this extension uses.
// Reference: https://roamdocs.fyi/types/roam-alpha-api.d.ts

declare const __DEFAULT_SERVER__: string;

type PullBlock = {
  ":block/uid"?: string;
  ":block/string"?: string;
  ":block/heading"?: number;
  ":block/order"?: number;
  ":block/text-align"?: string;
  ":children/view-type"?: string;
  ":node/title"?: string;
  ":block/children"?: PullBlock[];
};

type ContextMenuCommand<Ctx> = {
  label: string;
  callback: (ctx: Ctx) => void;
  "display-conditional"?: (ctx: Ctx) => boolean;
};

type BlockContextMenuInfo = { "block-uid": string; "page-uid": string; "block-string": string };

interface Window {
  roamAlphaAPI: {
    graph: { name: string; type: "hosted" | "offline"; isEncrypted: boolean };
    data: {
      async: {
        q(query: string, ...args: unknown[]): Promise<any>;
        pull(selector: string, eid: string | number): Promise<PullBlock | null>;
      };
    };
    ui: {
      mainWindow: {
        getOpenView(): Promise<{ type: string; uid?: string; title?: string }>;
        getOpenPageOrBlockUid(): Promise<string | null>;
      };
      blockContextMenu: {
        addCommand(args: ContextMenuCommand<BlockContextMenuInfo>): void;
        removeCommand(args: { label: string }): void;
      };
      pageContextMenu: {
        addCommand(args: ContextMenuCommand<Record<string, unknown>>): void;
        removeCommand(args: { label: string }): void;
      };
    };
    util: { dateToPageUid(date: Date): string };
  };
}

type SettingAction =
  | { type: "input"; placeholder?: string; onChange?: (e: Event) => void }
  | { type: "button"; onClick?: (e: Event) => void; content?: string };

type ExtensionAPI = {
  settings: {
    get(key: string): unknown;
    set(key: string, value: unknown): Promise<void>;
    panel: {
      create(config: {
        tabTitle: string;
        settings: Array<{ id: string; name: string; description?: string; action?: SettingAction }>;
      }): void;
    };
  };
  ui: {
    commandPalette: {
      addCommand(args: { label: string; callback: () => void }): void;
      removeCommand(args: { label: string }): void;
    };
  };
};
