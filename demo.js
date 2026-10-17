// Authentic package usage. Run with lumine/script/demo.js; fixtures stay in demo/.
module.exports = {
  version: 1,
  dependencies: ["language-tasklist"],
  viewport: { width: 1100, height: 340 },
  async before() {},
  async prepare(context) {
    const { state, open } = context;
    state.editor = await open("usage/experiment.tasklist");
  },
  scenes: [
    {
      id: "scene-1",
      file: "demo.png",
      caption: "Mark tasks as complete and track the remaining work.",
      timeout: 60000,
      async run(context) {
        const { lumine, state } = context;
        {
          lumine.grammars.assignLanguageMode(state.editor.getBuffer(), "text.tasklist");
          state.editor.setCursorBufferPosition([2, 0]);
          lumine.commands.dispatch(
            lumine.views.getView(state.editor),
            "tasklist-tools:set-as-done",
          );
        }
      },
      ready(context) {
        const { state } = context;
        const status = document.querySelector(".tasklist-status");
        return Boolean(
          state.editor.getText().includes("✔") &&
          status &&
          status.querySelector("#done-counter:not([hidden])") &&
          status.querySelector("#fail-counter[hidden]") &&
          status.querySelector("#info-counter[hidden]"),
        );
      },
    },
    {
      id: "empty-tasklist",
      file: "demo-empty.png",
      caption: "Keep a neutral status when no marked tasks remain.",
      async run(context) {
        const { lumine, state, open } = context;
        state.emptyEditor = await open("usage/empty.tasklist");
        lumine.grammars.assignLanguageMode(state.emptyEditor.getBuffer(), "text.tasklist");
        state.emptyEditor.setCursorBufferPosition([0, 0]);
      },
      ready(context) {
        const { state } = context;
        const status = document.querySelector(".tasklist-status");
        return Boolean(
          state.emptyEditor?.getGrammar().scopeName === "text.tasklist" &&
          status?.querySelector(".tasklist-status-empty:not([hidden])") &&
          !status.querySelector("[id$='-counter']:not([hidden])"),
        );
      },
    },
  ],
  async cleanup() {},
};
