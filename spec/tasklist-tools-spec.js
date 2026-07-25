describe("tasklist-tools", () => {
  let workspaceElement, editor, editorElement, mainModule;

  beforeEach(async () => {
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    editor = await atom.workspace.open();
    editorElement = atom.views.getView(editor);

    // The package defers activation until one of its commands is dispatched.
    const activation = atom.packages.activatePackage("tasklist-tools");
    atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
    mainModule = (await activation).mainModule;
    editor.setText("");
  });

  describe("command registration", () => {
    it("registers all task commands on text editors", () => {
      const commands = atom.commands
        .findCommands({ target: editorElement })
        .map((command) => command.name);
      for (const name of [
        "tasklist-tools:toggle-tick",
        "tasklist-tools:set-as-high",
        "tasklist-tools:set-as-todo",
        "tasklist-tools:set-as-done",
        "tasklist-tools:set-as-fail",
        "tasklist-tools:set-as-info",
        "tasklist-tools:go-to-next-tick",
        "tasklist-tools:translate-markdown",
        "tasklist-tools:move-items-to-next-header",
        "tasklist-tools:move-items-to-last-header",
        "tasklist-tools:move-to-next-header",
        "tasklist-tools:move-to-previous-header",
        "tasklist-tools:move-to-last-header",
      ]) {
        expect(commands).toContain(name);
      }
    });
  });

  describe("tasklist-tools:toggle-tick", () => {
    it("inserts a todo tick on an unticked line", () => {
      editor.setText("  task\n");
      editor.setCursorBufferPosition([0, 3]);
      atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("  ☐ task");
    });

    it("cycles todo -> done -> fail -> todo", () => {
      editor.setText("☐ task\n");
      editor.setCursorBufferPosition([0, 3]);
      atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("✔ task");
      atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("✘ task");
      atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("☐ task");
    });

    it("toggles every line of a multi-line selection", () => {
      editor.setText("☐ one\n▷ two\n• three\n");
      editor.setSelectedBufferRange([
        [0, 0],
        [2, 7],
      ]);
      atom.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("✔ one\n✔ two\n✔ three\n");
    });
  });

  describe("set-as commands", () => {
    it("sets the tick to the requested symbol", () => {
      const cases = [
        ["set-as-high", "▷"],
        ["set-as-todo", "☐"],
        ["set-as-done", "✔"],
        ["set-as-fail", "✘"],
        ["set-as-info", "•"],
      ];
      for (const [command, symbol] of cases) {
        editor.setText("☐ task\n");
        editor.setCursorBufferPosition([0, 3]);
        atom.commands.dispatch(editorElement, `tasklist-tools:${command}`);
        expect(editor.lineTextForBufferRow(0)).toBe(`${symbol} task`);
      }
    });

    it("inserts the requested symbol on an unticked line", () => {
      editor.setText("task\n");
      editor.setCursorBufferPosition([0, 2]);
      atom.commands.dispatch(editorElement, "tasklist-tools:set-as-fail");
      expect(editor.lineTextForBufferRow(0)).toBe("✘ task");
    });
  });

  describe("tasklist-tools:go-to-next-tick", () => {
    it("moves the cursor to the next tick below", () => {
      editor.setText("☐ one\ntext\n✔ two\n");
      editor.setCursorBufferPosition([0, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:go-to-next-tick");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("wraps around to the first tick", () => {
      editor.setText("☐ one\ntext\n✔ two\n");
      editor.setCursorBufferPosition([2, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:go-to-next-tick");
      expect(editor.getCursorBufferPosition().row).toBe(0);
    });

    it("filters by tick type", () => {
      editor.setText("☐ one\n✘ two\n☐ three\n");
      editor.setCursorBufferPosition([0, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:go-to-next-todo");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });
  });

  describe("tasklist-tools:translate-markdown", () => {
    it("converts markdown checkboxes and bullets to tasklist symbols", () => {
      editor.setText("- [ ] open\n- [x] closed\n* [X] upper\n- plain\n");
      atom.commands.dispatch(editorElement, "tasklist-tools:translate-markdown");
      expect(editor.getText()).toBe("☐ open\n✔ closed\n✔ upper\n• plain\n");
    });

    it("preserves indentation", () => {
      editor.setText("  - [ ] nested\n");
      atom.commands.dispatch(editorElement, "tasklist-tools:translate-markdown");
      expect(editor.getText()).toBe("  ☐ nested\n");
    });
  });

  describe("header navigation", () => {
    beforeEach(() => {
      editor.setText("First:\n☐ one\nSecond:\n☐ two\n☐ three\n");
    });

    it("moves the cursor to the next header", () => {
      editor.setCursorBufferPosition([1, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:move-to-next-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves the cursor to the previous header", () => {
      editor.setCursorBufferPosition([3, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:move-to-previous-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves the cursor to the last header", () => {
      editor.setCursorBufferPosition([0, 0]);
      atom.commands.dispatch(editorElement, "tasklist-tools:move-to-last-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves selected items below the next header", () => {
      editor.setCursorBufferPosition([1, 2]);
      atom.commands.dispatch(editorElement, "tasklist-tools:move-items-to-next-header");
      expect(editor.getText()).toBe("First:\nSecond:\n☐ one\n☐ two\n☐ three\n");
    });

    it("moves selected items below the last header", () => {
      editor.setCursorBufferPosition([1, 2]);
      atom.commands.dispatch(editorElement, "tasklist-tools:move-items-to-last-header");
      expect(editor.getText()).toBe("First:\nSecond:\n☐ one\n☐ two\n☐ three\n");
    });
  });

  describe("status bar integration", () => {
    it("adds a left tile through the status-bar service", () => {
      const tiles = [];
      const statusBar = {
        addLeftTile(tile) {
          tiles.push(tile);
          return { destroy() {}, getItem: () => tile.item };
        },
      };
      mainModule.consumeStatusBar(statusBar);
      expect(tiles.length).toBe(1);
      expect(tiles[0].item.element.classList.contains("tasklist-status")).toBe(true);
      mainModule.deactivateStatusBar();
    });

    it("counts ticks of each type", () => {
      mainModule.consumeStatusBar({ addLeftTile: () => ({ destroy() {} }) });
      const status = mainModule.tasklistStatus;
      status.editor = editor;
      editor.setText("▷ a\n☐ b\n☐ c\n✔ d\n✘ e\n• f\n• g\n");
      status.update();
      const counts = status.ticks.map((el) => el.count);
      expect(counts).toEqual([1, 2, 1, 1, 2]);
      mainModule.deactivateStatusBar();
    });
  });
});
