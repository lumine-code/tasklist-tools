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
        return Boolean(state.editor.getText().includes("✔"));
      },
    },
  ],
  async cleanup() {},
};
