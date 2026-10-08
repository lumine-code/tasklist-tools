describe("tasklist-tools status-bar service ownership", () => {
  let main, editor, hub, consumer, StatusBarView, bars, providers;
  const statusFor = (bar) =>
    bar
      .getLeftTiles()
      .find((tile) => tile.getItem().element?.classList.contains("tasklist-status"))
      ?.getItem();

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    ({ mainModule: main } = await lumine.packages.activatePackage("tasklist-tools"));
    StatusBarView = lumine.packages.getActivePackage("status-bar").mainModule.statusBar.constructor;
    editor = await lumine.workspace.open("status.tasklist");
    editor.setText("☐ one\n✔ two");
    hub = new lumine.packages.serviceHub.constructor();
    consumer = hub.consume("status-bar", "^1.0.0", (bar) => main.consumeStatusBar(bar));
    bars = [];
    providers = [];
  });

  afterEach(async () => {
    consumer.dispose();
    for (const provider of providers) provider.dispose();
    await lumine.packages.deactivatePackage("tasklist-tools");
    const coreBar = lumine.packages.getActivePackage("status-bar")?.mainModule.statusBar;
    for (const bar of [...bars, coreBar].filter(Boolean)) {
      for (const tile of bar.getLeftTiles().slice()) {
        if (!tile.getItem().element?.classList.contains("tasklist-status")) continue;
        tile.getItem().destroy();
        tile.destroy();
      }
    }
    for (const bar of bars) bar.destroy();
  });

  const provide = (bar = null) => {
    if (!bar) {
      bar = new StatusBarView();
      bars.push(bar);
      jasmine.attachToDOM(bar.element);
    }
    const provider = hub.provide("status-bar", "1.0.0", bar);
    providers.push(provider);
    return { bar, provider, status: statusFor(bar) };
  };

  it("releases only the older provider's tile, tooltip and editor subscriptions", () => {
    const older = provide();
    const current = provide();
    const oldUpdates = spyOn(older.status, "update").and.callThrough();
    const currentUpdates = spyOn(current.status, "update").and.callThrough();
    expect(lumine.tooltips.findTooltips(older.status.element).length).toBe(1);
    older.provider.dispose();
    expect(older.bar.getLeftTiles().length).toBe(0);
    expect(lumine.tooltips.findTooltips(older.status.element)).toEqual([]);
    expect(current.bar.getLeftTiles().length).toBe(1);
    editor.setText("✔ one\n✔ two");
    advanceClock(500);
    expect(oldUpdates).not.toHaveBeenCalled();
    expect(currentUpdates).toHaveBeenCalled();
    expect(current.status.ticks.map((tick) => tick.count)).toEqual([0, 0, 2, 0, 0]);
  });

  it("shares one tile for identical payloads until their last lease ends", () => {
    const first = provide();
    const second = provide(first.bar);
    expect(first.bar.getLeftTiles().length).toBe(1);
    expect(second.status).toBe(first.status);
    first.provider.dispose();
    expect(first.bar.getLeftTiles().length).toBe(1);
    expect(lumine.tooltips.findTooltips(first.status.element).length).toBe(1);
    second.provider.dispose();
    expect(first.bar.getLeftTiles().length).toBe(0);
    expect(lumine.tooltips.findTooltips(first.status.element)).toEqual([]);
  });

  it("applies status-bar configuration to every live provider without duplicate tiles", () => {
    const first = provide();
    const second = provide();
    lumine.config.set("tasklist-tools.statusBar", false);
    for (const entry of [first, second]) {
      expect(entry.bar.getLeftTiles().length).toBe(0);
      expect(lumine.tooltips.findTooltips(entry.status.element)).toEqual([]);
    }
    lumine.config.set("tasklist-tools.statusBar", true);
    main.activateStatusBar();
    for (const entry of [first, second]) {
      expect(entry.bar.getLeftTiles().length).toBe(1);
      expect(statusFor(entry.bar)).not.toBe(entry.status);
    }
    editor.setText("▷ first\n☐ second");
    advanceClock(500);
    expect(statusFor(first.bar).ticks.map((tick) => tick.count)).toEqual([1, 1, 0, 0, 0]);
    expect(statusFor(second.bar).ticks.map((tick) => tick.count)).toEqual([1, 1, 0, 0, 0]);
  });

  it("retires every owned connection on package deactivation", async () => {
    const first = provide();
    const second = provide();
    await lumine.packages.deactivatePackage("tasklist-tools");
    for (const entry of [first, second]) {
      expect(entry.bar.getLeftTiles().length).toBe(0);
      expect(lumine.tooltips.findTooltips(entry.status.element)).toEqual([]);
      expect(entry.status.editor).toBeNull();
    }
  });

  it("does not retire a new activation's same-payload connection from an old lease", async () => {
    const old = provide();
    await lumine.packages.deactivatePackage("tasklist-tools");
    ({ mainModule: main } = await lumine.packages.activatePackage("tasklist-tools"));
    const current = provide(old.bar);
    old.provider.dispose();
    expect(old.bar.getLeftTiles().length).toBe(1);
    expect(statusFor(old.bar)).toBe(current.status);
    current.provider.dispose();
    expect(old.bar.getLeftTiles().length).toBe(0);
    expect(lumine.tooltips.findTooltips(current.status.element)).toEqual([]);
  });

  it("leaves the provider's status bar and unrelated tiles alive", () => {
    const entry = provide();
    const destroy = spyOn(entry.bar, "destroy").and.callThrough();
    const unrelated = document.createElement("span");
    const tile = entry.bar.addLeftTile({ item: unrelated, priority: 999 });
    entry.provider.dispose();
    expect(destroy).not.toHaveBeenCalled();
    expect(entry.bar.getLeftTiles()).toEqual([tile]);
    expect(lumine.tooltips.findTooltips(entry.status.element)).toEqual([]);
    tile.destroy();
  });

  it("cleans staged resources if the package deactivates while a tile is added", () => {
    const bar = new StatusBarView();
    bars.push(bar);
    const addLeftTile = bar.addLeftTile.bind(bar);
    let staged;
    spyOn(bar, "addLeftTile").and.callFake((options) => {
      staged = options.item;
      const tile = addLeftTile(options);
      main.deactivate();
      return tile;
    });
    const lease = main.consumeStatusBar(bar);
    expect(bar.getLeftTiles().length).toBe(0);
    expect(lumine.tooltips.findTooltips(staged.element)).toEqual([]);
    expect(staged.editor).toBeNull();
    lease.dispose();
  });

  it("rolls back a failed tile creation and permits a clean retry", () => {
    const bar = new StatusBarView();
    bars.push(bar);
    let staged;
    const add = spyOn(bar, "addLeftTile").and.callFake((options) => {
      staged = options.item;
      throw new Error("Tile creation failed");
    });
    expect(() => main.consumeStatusBar(bar)).toThrowError("Tile creation failed");
    expect(lumine.tooltips.findTooltips(staged.element)).toEqual([]);
    expect(staged.editor).toBeNull();
    add.and.callThrough();
    const lease = main.consumeStatusBar(bar);
    expect(bar.getLeftTiles().length).toBe(1);
    lease.dispose();
    expect(bar.getLeftTiles().length).toBe(0);
  });
});
