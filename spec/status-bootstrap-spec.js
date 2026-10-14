const path = require("node:path");
const windowService = require("./helpers/window-service");

describe("tasklist status bootstrap", () => {
  let main, editor, bar, leases;
  const tiles = () =>
    bar.getLeftTiles().filter((tile) => tile.getItem().element?.matches(".tasklist-status"));

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    if (lumine.packages.isPackageLoaded("tasklist-tools"))
      await lumine.packages.unloadPackage("tasklist-tools");
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.nullGrammar);
    main = (await lumine.packages.activatePackage("tasklist-tools")).mainModule;
    const StatusBar =
      lumine.packages.getActivePackage("status-bar").mainModule.statusBar.constructor;
    bar = new StatusBar();
    leases = [main.consumeStatusBar(windowService(bar))];
  });

  afterEach(async () => {
    for (const lease of leases) lease.dispose();
    await lumine.packages.unloadPackage("tasklist-tools");
    bar.destroy();
  });

  it("leaves unused status UI cold and creates the current counts on a grammar change", () => {
    const filename = path.join(__dirname, "../lib/status.js");
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(false);
    expect(tiles()).toEqual([]);
    editor.setText("☐ first\n☐ second");
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(tiles().length).toBe(1);
    expect(Object.values(require.cache).some((entry) => entry?.filename === filename)).toBe(true);
    expect(
      tiles()[0]
        .getItem()
        .ticks.map((tick) => tick.count),
    ).toEqual([0, 2, 0, 0, 0]);
  });

  it("rearms grammar observation after disabling an already created tile", () => {
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(tiles().length).toBe(1);
    lumine.config.set("tasklist-tools.statusBar", false);
    editor.setGrammar(lumine.grammars.nullGrammar);
    lumine.config.set("tasklist-tools.statusBar", true);
    expect(tiles().length).toBe(0);
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(tiles().length).toBe(1);
  });

  it("cannot create an unused provider's tile after its final lease ends", () => {
    leases.push(main.consumeStatusBar(windowService(bar)));
    leases[0].dispose();
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(tiles().length).toBe(1);
    lumine.config.set("tasklist-tools.statusBar", false);
    editor.setGrammar(lumine.grammars.nullGrammar);
    leases[1].dispose();
    lumine.config.set("tasklist-tools.statusBar", true);
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    expect(tiles().length).toBe(0);
  });
});
