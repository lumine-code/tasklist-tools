describe("Task status follows the active editor grammar", () => {
  let editor, other, status;

  beforeEach(async () => {
    jasmine.useRealClock();
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      if (!jasmine.isSpy(lumine.shell[method])) spyOn(lumine.shell, method).and.resolveTo();
    if (!jasmine.isSpy(lumine.application.openWindow))
      spyOn(lumine.application, "openWindow").and.resolveTo();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    editor.setText("☐ owned\n✔ done");
    status = (await lumine.packages.activatePackage("tasklist-tools")).mainModule.tasklistStatus;
    expect(status).toBeDefined();
    expect(status.element.style.display).toBe("");
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("tasklist-tools"))
      await lumine.packages.unloadPackage("tasklist-tools");
    editor?.destroy();
    other?.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    editor = other = status = null;
  });

  it("hides when the current tasklist changes to plain text", () => {
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(status.element.style.display).toBe("none");
  });

  it("shows the current plain editor when it becomes a tasklist", async () => {
    other = await lumine.workspace.open();
    other.setText("☐ first\n☐ second");
    expect(status.element.style.display).toBe("none");
    other.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(status.element.style.display).toBe("");
    expect(status.element.querySelector("#todo-counter").label.textContent).toBe("2");
  });

  it("continues updating counts for ordinary tasklist edits", async () => {
    editor.setText("☐ first\n☐ second\n✔ done");
    await conditionPromise(
      () => status.element.querySelector("#todo-counter").label.textContent === "2",
    );
    expect(status.element.style.display).toBe("");
    expect(status.element.querySelector("#done-counter").label.textContent).toBe("1");
  });
});
