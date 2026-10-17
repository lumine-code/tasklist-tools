describe("Task status follows the active editor grammar", () => {
  let editor, other, status;
  const visibleCounters = () => status.ticks.filter((tick) => !tick.hidden);
  const tooltipTitle = () => lumine.tooltips.findTooltips(status.element)[0].getTitle();

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

  it("shows only positive counts and gives a done-only tasklist no leading gap", () => {
    editor.setText("✔ first\n✔ second");
    status.update();
    expect(status.ticks.map((tick) => tick.count)).toEqual([0, 0, 2, 0, 0]);
    expect(status.ticks.map((tick) => tick.label.textContent)).toEqual(["0", "0", "2", "0", "0"]);
    expect(visibleCounters().map((tick) => tick.name)).toEqual(["done"]);
    expect(visibleCounters()[0].style.marginLeft).toBe("");
    expect(status.emptyIcon.hidden).toBe(true);
    expect(tooltipTitle()).toBe("Task counts. Click to go to the next task.");
  });

  it("shows a neutral empty state and restores counts as marked lines appear and disappear", () => {
    editor.setText("Tasks:\nNo marked lines yet.");
    status.update();
    expect(status.element.style.display).toBe("");
    expect(visibleCounters()).toEqual([]);
    expect(status.emptyIcon.hidden).toBe(false);
    expect(status.emptyIcon.ownerDocument).toBe(status.element.ownerDocument);
    expect(tooltipTitle()).toBe("No marked lines in this tasklist.");

    editor.setText("☐ new task");
    status.update();
    expect(visibleCounters().map((tick) => tick.name)).toEqual(["todo"]);
    expect(visibleCounters()[0].label.textContent).toBe("1");
    expect(status.emptyIcon.hidden).toBe(true);
    expect(tooltipTitle()).toBe("Task counts. Click to go to the next task.");

    editor.setText("");
    status.update();
    expect(status.element.style.display).toBe("");
    expect(visibleCounters()).toEqual([]);
    expect(status.emptyIcon.hidden).toBe(false);
    expect(tooltipTitle()).toBe("No marked lines in this tasklist.");
  });

  it("spaces only the visible counters and preserves their authored order", () => {
    editor.setText("☐ task\n• note");
    status.update();
    expect(visibleCounters().map((tick) => tick.name)).toEqual(["todo", "info"]);
    expect(visibleCounters().map((tick) => tick.style.marginLeft)).toEqual(["", "0.5em"]);

    editor.setText("▷ urgent\n✔ done");
    status.update();
    expect(visibleCounters().map((tick) => tick.name)).toEqual(["high", "done"]);
    expect(visibleCounters().map((tick) => tick.style.marginLeft)).toEqual(["", "0.5em"]);
  });

  it("recounts the current text after returning from another grammar", () => {
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(status.element.style.display).toBe("none");
    editor.setText("• note");
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(status.element.style.display).toBe("");
    expect(visibleCounters().map((tick) => tick.name)).toEqual(["info"]);
    expect(visibleCounters()[0].label.textContent).toBe("1");
    expect(visibleCounters()[0].style.marginLeft).toBe("");
    expect(status.emptyIcon.hidden).toBe(true);
  });
});
