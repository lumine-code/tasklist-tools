describe("tasklist status window context", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("tasklist-tools");
    lumine.config.set("tasklist-tools.statusBar", true);
  });

  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
  });

  it("counts and navigates each window's tasklist independently", async () => {
    const workspace = lumine.workspace;
    const main = workspace.getMainWindow();
    const editor = await workspace.open();
    const grammar = lumine.grammars.grammarForScopeName("text.tasklist");
    editor.setGrammar(grammar);
    editor.setText("☐ first\n☐ second");
    const extra = await workspace.openEditorWindow({ show: false });
    const other = workspace.buildTextEditor();
    other.setGrammar(grammar);
    other.setText("☐ third");
    extra.getEditorContainer().getActivePane().activateItem(other, { activatePane: true });
    const local = main.getElement().querySelector(".tasklist-status");
    const remote = extra.getElement().querySelector(".tasklist-status");
    expect(local.ownerDocument).toBe(main.getDocument());
    expect(remote.ownerDocument).toBe(extra.getDocument());
    await conditionPromise(() => local.querySelector("#todo-counter").count === 2);
    expect(local.querySelector("#todo-counter").count).toBe(2);
    expect(remote.querySelector("#todo-counter").count).toBe(1);
    const dispatch = spyOn(lumine.commands, "dispatch");
    local.onmouseup({ which: 1 });
    expect(dispatch).toHaveBeenCalledOnceWith(
      lumine.views.getView(editor),
      "tasklist-tools:go-to-next-tick",
    );
    dispatch.calls.reset();
    remote.onmouseup({ which: 3 });
    expect(dispatch).toHaveBeenCalledOnceWith(
      lumine.views.getView(other),
      "tasklist-tools:toggle-tick",
    );
  });
});
