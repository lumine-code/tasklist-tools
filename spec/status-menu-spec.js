describe("Tasklist status action menu", () => {
  let editor, tile;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    await lumine.packages.activatePackage("tasklist-tools");
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    editor.setText("☐ first\n☐ second");
    tile = lumine.workspace.getElement().querySelector(".tasklist-status");
  });
  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
    await lumine.packages.deactivatePackage("tasklist-tools");
  });
  it("offers every gesture, specific task states, and navigation by type", () => {
    const menu = lumine.contextMenu.templateForElement(tile);
    expect(menu[0].command).toBe("tasklist-tools:go-to-next-tick");
    expect(menu[1].command).toBe("tasklist-tools:toggle-tick");
    expect(menu.find((item) => item.label === "Go to Next").submenu).toHaveSize(5);
    expect(menu.find((item) => item.label === "Set as").submenu).toHaveSize(5);
    const dispatch = spyOn(lumine.commands, "dispatch");
    tile.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
    lumine.contextMenu.templateForElement(tile);
    expect(dispatch).not.toHaveBeenCalled();
    tile.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
    tile.dispatchEvent(new MouseEvent("mouseup", { button: 1 }));
    expect(dispatch.calls.allArgs()).toEqual([
      [tile, "tasklist-tools:go-to-next-tick"],
      [tile, "tasklist-tools:toggle-tick"],
    ]);
  });
  it("acts on the tasklist of the window owning the menu", async () => {
    const extra = await lumine.workspace.openEditorWindow({ show: false });
    const other = lumine.workspace.buildTextEditor();
    other.setGrammar(editor.getGrammar());
    other.setText("☐ remote");
    extra.getEditorContainer().getActivePane().activateItem(other, { activatePane: true });
    const remoteTile = extra.getElement().querySelector(".tasklist-status");
    await lumine.commands.dispatch(remoteTile, "tasklist-tools:toggle-tick");
    expect(other.getText()).toBe("✔ remote");
    expect(editor.getText()).toBe("☐ first\n☐ second");
  });
  it("disposes the menu and mouse listeners", async () => {
    await lumine.packages.deactivatePackage("tasklist-tools");
    const dispatch = spyOn(lumine.commands, "dispatch");
    tile.dispatchEvent(new MouseEvent("mouseup", { button: 0 }));
    expect(dispatch).not.toHaveBeenCalled();
    expect(lumine.contextMenu.templateForElement(tile)).toEqual([]);
  });
});
