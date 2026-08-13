// https://roamresearch.com/#/app/developer-documentation/page/U20pidYPl

export default {
  onload: ({ extensionAPI, extension }) => {
    console.log("loading version", extension.version);
    extensionAPI.ui.commandPalette.addCommand({
      label: "Roam Publish: Publish Page",
      callback: () => console.log("hi"),
    });
    // optionally return a cleanup function;
    // it runs at unload, right before onunload
  },
  onunload: () => {
    // undo anything not covered by automatic cleanup
    // (DOM nodes, event listeners, intervals, ...)
  },
};
