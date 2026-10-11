beforeEach(() => {
  for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
    spyOn(lumine.shell, method).and.resolveTo();
  spyOn(lumine.application, "openWindow").and.resolveTo();
});

describe("Task commands in split editors", () => {
  let target, other;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("tasklist-tools");
    target = await lumine.workspace.open();
    target.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    target.setText("☐ first\n☐ second");
    target.setCursorBufferPosition([0, 0]);
    other = await lumine.workspace.open(undefined, { split: "right" });
    other.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    other.setText("☐ other");
    expect(lumine.workspace.getActiveTextEditor()).toBe(other);
  });

  afterEach(async () => {
    target?.destroy();
    other?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    target = other = null;
  });

  it("changes the task in the editor that dispatched the command", async () => {
    await lumine.commands.dispatch(target.getElement(), "tasklist-tools:set-as-done");
    expect(target.getText()).toBe("✔ first\n☐ second");
    expect(other.getText()).toBe("☐ other");
  });

  it("navigates the initiating tasklist while another grammar is active", async () => {
    other.setGrammar(lumine.grammars.nullGrammar);
    await lumine.commands.dispatch(target.getElement(), "tasklist-tools:go-to-next-todo");
    expect(target.getCursorBufferPosition().row).toBe(1);
    expect(other.getCursorBufferPosition().row).toBe(0);
  });

  it("declines a plain editor instead of modifying the active tasklist", async () => {
    target.setGrammar(lumine.grammars.nullGrammar);
    const warning = spyOn(lumine.notifications, "addWarning");
    await lumine.commands.dispatch(target.getElement(), "tasklist-tools:set-as-done");
    expect(target.getText()).toBe("☐ first\n☐ second");
    expect(other.getText()).toBe("☐ other");
    expect(warning).toHaveBeenCalledWith("Not a tasklist file");
  });

  it("uses the active tasklist for a workspace menu dispatch", async () => {
    await lumine.commands.dispatch(lumine.workspace.getElement(), "tasklist-tools:set-as-done");
    expect(target.getText()).toBe("☐ first\n☐ second");
    expect(other.getText()).toBe("✔ other");
  });
});
