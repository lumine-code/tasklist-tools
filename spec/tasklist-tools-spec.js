describe("tasklist-tools", () => {
  let workspaceElement, editor, editorElement, mainModule;

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    // Every command declines outside a tasklist, so the buffer has to be one.
    // A stand-in grammar rather than language-tasklist: the scope name is the
    // whole contract between the two packages, and depending on the real one
    // would make this suite need a package it does not ship with.
    lumine.grammars.addGrammar(
      lumine.grammars.createGrammar("tasklist.json", {
        name: "Tasklist",
        scopeName: "text.tasklist",
        fileTypes: ["tasklist"],
        patterns: [],
      }),
    );
    editor = await lumine.workspace.open("notes.tasklist");
    editorElement = lumine.views.getView(editor);

    // The package defers activation until one of its commands is dispatched.
    const activation = lumine.packages.activatePackage("tasklist-tools");
    lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
    mainModule = (await activation).mainModule;
    editor.setText("");
  });

  describe("command registration", () => {
    it("registers all task commands on text editors", () => {
      const commands = lumine.commands
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

    // The application menu dispatches at whatever holds focus, so the commands
    // have to be reachable from the workspace — and, being reachable
    // everywhere, they have to refuse anywhere they do not belong.
    it("registers them on the workspace, not on the editor element", () => {
      const commands = lumine.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);

      expect(commands).toContain("tasklist-tools:toggle-tick");
    });

    it("declines and says why when the buffer is not a tasklist", async () => {
      const other = await lumine.workspace.open("notes.txt");
      other.setText("plain text\n");
      const warnings = [];
      lumine.notifications.onDidAddNotification((notification) => warnings.push(notification));

      lumine.commands.dispatch(workspaceElement, "tasklist-tools:set-as-done");

      expect(other.getText()).toBe("plain text\n");
      expect(warnings.length).toBe(1);
      expect(warnings[0].getType()).toBe("warning");
    });
  });

  describe("middle-click toggling", () => {
    function targetLineFor(targetEditor) {
      const targetElement = lumine.views.getView(targetEditor);
      targetElement.getComponent().updateSync();
      return targetElement.querySelector(".line[data-screen-row]");
    }

    function middleClick(target) {
      mainModule.eventHandler({
        which: 2,
        target,
        stopPropagation: jasmine.createSpy("stopPropagation"),
      });
    }

    it("acts only on a non-mini tasklist editor", async () => {
      editor.setText("☐ task");
      const mutate = spyOn(mainModule, "tickMutate");

      middleClick(targetLineFor(editor));
      expect(mutate).toHaveBeenCalledTimes(1);

      const plainEditor = await lumine.workspace.open("notes.txt");
      plainEditor.setText("plain text");
      mutate.calls.reset();
      middleClick(targetLineFor(plainEditor));
      expect(mutate).not.toHaveBeenCalled();

      const miniEditor = lumine.workspace.buildTextEditor({ mini: true });
      miniEditor.setGrammar(editor.getGrammar());
      const miniElement = lumine.views.getView(miniEditor);
      const fakeLine = document.createElement("div");
      fakeLine.className = "line";
      fakeLine.dataset.screenRow = "0";
      miniElement.appendChild(fakeLine);
      mutate.calls.reset();
      middleClick(fakeLine);
      expect(mutate).not.toHaveBeenCalled();
      miniEditor.destroy();
      plainEditor.destroy();
    });
  });

  describe("tasklist-tools:toggle-tick", () => {
    it("inserts a todo tick on an unticked line", () => {
      editor.setText("  task\n");
      editor.setCursorBufferPosition([0, 3]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("  ☐ task");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([0, 5]);
    });

    it("leaves an empty selection after inserting a tick", () => {
      editor.setText("task");
      editor.setCursorBufferPosition([0, 2]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([0, 4]);
    });

    it("inserts a tick on an empty final line without selecting it", () => {
      editor.setText("task\n");
      editor.setCursorBufferPosition([1, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("task\n☐ ");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([1, 2]);
    });

    it("inserts a tick into an empty file without selecting it", () => {
      editor.setText("");
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("☐ ");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([0, 2]);
    });

    it("keeps every cursor empty when inserting ticks at multiple rows including EOF", () => {
      editor.setText("one\ntwo\n");
      editor.setCursorBufferPosition([0, 1]);
      editor.addCursorAtBufferPosition([1, 1]);
      editor.addCursorAtBufferPosition([2, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("☐ one\n☐ two\n☐ ");
      expect(editor.getSelections().every((selection) => selection.isEmpty())).toBe(true);
      expect(editor.getCursorBufferPositions().map((point) => point.toArray())).toEqual([
        [0, 3],
        [1, 3],
        [2, 2],
      ]);
    });

    it("restores a clean cursor when undoing and redoing an EOF insertion", () => {
      editor.setText("task\n");
      editor.setCursorBufferPosition([1, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      editor.undo();
      expect(editor.getText()).toBe("task\n");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([1, 0]);
      editor.redo();
      expect(editor.getText()).toBe("task\n☐ ");
      expect(editor.getSelectedText()).toBe("");
      expect(editor.getCursorBufferPosition().toArray()).toEqual([1, 2]);
    });

    it("cycles todo -> done -> fail -> todo", () => {
      editor.setText("☐ task\n");
      editor.setCursorBufferPosition([0, 3]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("✔ task");
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("✘ task");
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.lineTextForBufferRow(0)).toBe("☐ task");
    });

    it("does not select text when the cursor touches an existing tick", () => {
      for (const { text, column } of [
        { text: "☐ task", column: 0 },
        { text: "☐ task", column: 1 },
        { text: "☐ task", column: 2 },
        { text: "☐", column: 0 },
        { text: "☐", column: 1 },
      ]) {
        editor.setText(text);
        editor.setCursorBufferPosition([0, column]);
        lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
        expect(editor.getSelectedText()).toBe("");
        expect(editor.getCursorBufferPosition().toArray()).toEqual([0, column]);
      }
    });

    it("toggles every line of a multi-line selection", () => {
      editor.setText("☐ one\n▷ two\n• three\n");
      editor.setSelectedBufferRange([
        [0, 0],
        [2, 7],
      ]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("✔ one\n✔ two\n✔ three\n");
    });

    it("includes the final row of a selection at EOF without a trailing newline", () => {
      editor.setText("☐ one\n☐ two");
      editor.setSelectedBufferRange([
        [0, 0],
        [1, 5],
      ]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("✔ one\n✔ two");
    });

    it("recognizes ticks after tab and mixed indentation", () => {
      editor.setText("\t☐ one\n \t ✔ two\n");
      editor.setSelectedBufferRange([
        [0, 0],
        [1, 6],
      ]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:toggle-tick");
      expect(editor.getText()).toBe("\t✔ one\n \t ✘ two\n");
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
        lumine.commands.dispatch(editorElement, `tasklist-tools:${command}`);
        expect(editor.lineTextForBufferRow(0)).toBe(`${symbol} task`);
      }
    });

    it("inserts the requested symbol on an unticked line", () => {
      editor.setText("task\n");
      editor.setCursorBufferPosition([0, 2]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:set-as-fail");
      expect(editor.lineTextForBufferRow(0)).toBe("✘ task");
    });
  });

  describe("tasklist-tools:go-to-next-tick", () => {
    it("moves the cursor to the next tick below", () => {
      editor.setText("☐ one\ntext\n✔ two\n");
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:go-to-next-tick");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("wraps around to the first tick", () => {
      editor.setText("☐ one\ntext\n✔ two\n");
      editor.setCursorBufferPosition([2, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:go-to-next-tick");
      expect(editor.getCursorBufferPosition().row).toBe(0);
    });

    it("filters by tick type", () => {
      editor.setText("☐ one\n✘ two\n☐ three\n");
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:go-to-next-todo");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("finds ticks after tab and mixed indentation", () => {
      editor.setText("☐ one\n\t✔ two\n \t ☐ three\n");
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:go-to-next-tick");
      expect(editor.getCursorBufferPosition().row).toBe(1);
      lumine.commands.dispatch(editorElement, "tasklist-tools:go-to-next-todo");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });
  });

  describe("tasklist-tools:translate-markdown", () => {
    it("converts markdown checkboxes and bullets to tasklist symbols", () => {
      editor.setText("- [ ] open\n- [x] closed\n* [X] upper\n- plain\n");
      lumine.commands.dispatch(editorElement, "tasklist-tools:translate-markdown");
      expect(editor.getText()).toBe("☐ open\n✔ closed\n✔ upper\n• plain\n");
    });

    it("preserves indentation", () => {
      editor.setText("  - [ ] nested\n");
      lumine.commands.dispatch(editorElement, "tasklist-tools:translate-markdown");
      expect(editor.getText()).toBe("  ☐ nested\n");
    });
  });

  describe("header navigation", () => {
    beforeEach(() => {
      editor.setText("First:\n☐ one\nSecond:\n☐ two\n☐ three\n");
    });

    it("moves the cursor to the next header", () => {
      editor.setCursorBufferPosition([1, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:move-to-next-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves the cursor to the previous header", () => {
      editor.setCursorBufferPosition([3, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:move-to-previous-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves the cursor to the last header", () => {
      editor.setCursorBufferPosition([0, 0]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:move-to-last-header");
      expect(editor.getCursorBufferPosition().row).toBe(2);
    });

    it("moves selected items below the next header", () => {
      editor.setCursorBufferPosition([1, 2]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:move-items-to-next-header");
      expect(editor.getText()).toBe("First:\nSecond:\n☐ one\n☐ two\n☐ three\n");
    });

    it("moves selected items below the last header", () => {
      editor.setCursorBufferPosition([1, 2]);
      lumine.commands.dispatch(editorElement, "tasklist-tools:move-items-to-last-header");
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

    it("counts ticks after tab and mixed indentation", () => {
      mainModule.consumeStatusBar({ addLeftTile: () => ({ destroy() {} }) });
      const status = mainModule.tasklistStatus;
      status.editor = editor;
      editor.setText("\t▷ a\n \t ☐ b\n\t✔ c\n \t✘ d\n\t • e\n");
      status.update();
      const counts = status.ticks.map((el) => el.count);
      expect(counts).toEqual([1, 1, 1, 1, 1]);
      mainModule.deactivateStatusBar();
    });
  });
});
