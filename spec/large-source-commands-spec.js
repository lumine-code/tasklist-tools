describe("source-backed tasklist commands", () => {
  let editor, main, buffer;
  const prefix = "x".repeat(1024 * 1024 + 1) + "\n";
  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("language-tasklist");
    main = (await lumine.packages.activatePackage("tasklist-tools")).mainModule;
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    editor.displayLayer.reset({ softWrapColumn: Infinity });
    buffer = editor.getBuffer();
  });
  afterEach(async () => {
    editor.destroy();
    await lumine.packages.deactivatePackage("tasklist-tools");
  });

  it("changes selected task marks in one atomic edit and preserves exact undo", async () => {
    editor.setText(prefix + "☐ one\r\n✔ two\nplain\n");
    editor.setSelectedBufferRange(
      [
        [1, 0],
        [3, 5],
      ],
      { reversed: true },
    );
    buffer.clearUndoStack();
    const before = buffer.getTextSnapshot();
    const read = spyOn(editor, "getText").and.throwError("whole document");
    const changes = jasmine.createSpy("applied");
    const lease = buffer.onDidApplyChanges(changes);
    try {
      await main.task();
    } finally {
      read.and.callThrough();
      lease.dispose();
    }
    expect(buffer.getTextSnapshot().slice(prefix.length)).toBe("✔ one\r\n✘ two\nplain\n");
    expect(editor.getLastSelection().isReversed()).toBeTrue();
    expect(changes).toHaveBeenCalledTimes(1);
    editor.undo();
    expect(buffer.getTextSnapshot().equals(before)).toBeTrue();
  });

  it("places a new mark after indentation without moving a cursor inside the indent", async () => {
    for (const column of [2, 6]) {
      editor.setText(prefix + "     plain");
      editor.setCursorBufferPosition([1, column]);
      await main.task("✘");
      expect(buffer.getTextSnapshot().slice(prefix.length)).toBe("     ✘ plain");
      expect(editor.getCursorBufferPosition().column).toBe(column < 5 ? column : column + 2);
    }
  });

  it("translates dense Markdown tasks with exact CRLF and one undo", async () => {
    editor.setText(prefix + " - [ ] open\r\n* [X] done\r\n- bullet\r\n".repeat(1500));
    buffer.clearUndoStack();
    const before = buffer.getTextSnapshot();
    await main.translate();
    expect(buffer.getTextSnapshot().slice(prefix.length)).toBe(
      " ☐ open\r\n✔ done\r\n• bullet\r\n".repeat(1500),
    );
    editor.undo();
    expect(buffer.getTextSnapshot().equals(before)).toBeTrue();
  });

  it("retains multiline-anchor behavior for CR and Unicode separators within a buffer row", async () => {
    const suffix = "☐ a\r✔ b\u2028✘ c\u2029• d\n";
    editor.setText(prefix + suffix);
    editor.setSelectedBufferRange([[1, 0], buffer.getEndPosition()]);
    await main.task();
    expect(buffer.getTextSnapshot().slice(prefix.length)).toBe("✔ a\r✘ b\u2028☐ c\u2029✔ d\n");
    editor.setText(prefix + "- [ ] a\r* [x] b\u2028- c\u2029* [X] d\n");
    await main.translate();
    expect(buffer.getTextSnapshot().slice(prefix.length)).toBe("☐ a\r✔ b\u2028• c\u2029✔ d\n");
  });

  it("navigates task types with wraparound and finds headers without line strings", async () => {
    editor.setText(prefix + "First:\n☐ one\n  Last:  \n✔ two\n");
    editor.setCursorBufferPosition([2, 0]);
    const read = spyOn(editor, "lineTextForBufferRow").and.throwError("whole line");
    try {
      await main.goToNextTick(/^[\t ]*✔/gm);
      expect(editor.getCursorBufferPosition().row).toBe(4);
      await main.goToNextTick(/^[\t ]*☐/gm);
      expect(editor.getCursorBufferPosition().row).toBe(2);
      await main.moveToNextHeader();
      expect(editor.getCursorBufferPosition().row).toBe(3);
      await main.moveToPreviousHeader();
      expect(editor.getCursorBufferPosition().row).toBe(1);
      await main.moveToLastHeader();
      expect(editor.getCursorBufferPosition().row).toBe(3);
    } finally {
      read.and.callThrough();
    }
  });

  it("moves a giant task using a snapshot and separates a final header without a newline", async () => {
    const task = "☐ " + "x".repeat(1024 * 1024 + 1);
    editor.setText("First:\n" + task + "\nLast:");
    editor.setCursorBufferPosition([1, 2]);
    buffer.clearUndoStack();
    const before = buffer.getTextSnapshot();
    const read = spyOn(editor.getLastSelection(), "getText").and.throwError("whole selection");
    try {
      await main.moveItemsToLastHeader();
    } finally {
      read.and.callThrough();
    }
    expect(buffer.getTextSnapshot().slice(0, 15)).toBe("First:\nLast:\n☐ ");
    expect(buffer.getTextSnapshot().slice(-8)).toBe("xxxxxxx\n");
    editor.undo();
    expect(buffer.getTextSnapshot().equals(before)).toBeTrue();
  });

  it("cancels a stale preparation without applying part of the conversion", async () => {
    editor.setText(prefix + "- [ ] task\n".repeat(3000));
    const before = buffer.getTextSnapshot();
    const pending = main.translate();
    buffer.append("user change");
    await pending;
    expect(buffer.getTextSnapshot().subtext(0, before.length).equals(before)).toBeTrue();
    expect(buffer.getTextSnapshot().slice(before.length)).toBe("user change");
  });
});
