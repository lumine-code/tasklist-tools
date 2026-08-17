const { CompositeDisposable, Point } = require("lumine");
const { TasklistStatus } = require("./status");

/**
 * Tasklist Tools Package
 * Provides task management with symbolic markers for todo lists.
 * Supports toggling task states, mouse interaction, and header navigation.
 */
module.exports = {
  /**
   * Activates the package and registers task management commands.
   */
  activate() {
    this.eventHandlerBinded = this.eventHandler.bind(this);
    this.disposables = new CompositeDisposable();
    this.disposables.add(
      lumine.commands.add("lumine-workspace", {
        "tasklist-tools:toggle-tick": {
          description: "Step the line's mark on to the next state.",
          didDispatch: () => this.task(),
        },
        "tasklist-tools:set-as-high": {
          description: "Mark the line as high priority.",
          didDispatch: () => this.task("▷"),
        },
        "tasklist-tools:set-as-todo": {
          description: "Mark the line as still to do.",
          didDispatch: () => this.task("☐"),
        },
        "tasklist-tools:set-as-done": {
          description: "Mark the line as done.",
          didDispatch: () => this.task("✔"),
        },
        "tasklist-tools:set-as-fail": {
          description: "Mark the line as failed or abandoned.",
          didDispatch: () => this.task("✘"),
        },
        "tasklist-tools:set-as-info": {
          description: "Mark the line as a note rather than a task.",
          didDispatch: () => this.task("•"),
        },
        "tasklist-tools:go-to-next-tick": {
          description: "Move the cursor to the next marked line, whatever its mark.",
          didDispatch: () => this.goToNextTick(/^[\t ]*(▷|☐|✔|✘|•)/gm),
        },
        "tasklist-tools:go-to-next-high": {
          description: "Move the cursor to the next high-priority line.",
          didDispatch: () => this.goToNextTick(/^[\t ]*▷/gm),
        },
        "tasklist-tools:go-to-next-todo": {
          description: "Move the cursor to the next line still to do.",
          didDispatch: () => this.goToNextTick(/^[\t ]*☐/gm),
        },
        "tasklist-tools:go-to-next-done": {
          description: "Move the cursor to the next line marked done.",
          didDispatch: () => this.goToNextTick(/^[\t ]*✔/gm),
        },
        "tasklist-tools:go-to-next-fail": {
          description: "Move the cursor to the next line marked failed.",
          didDispatch: () => this.goToNextTick(/^[\t ]*✘/gm),
        },
        "tasklist-tools:go-to-next-info": {
          description: "Move the cursor to the next line marked as a note.",
          didDispatch: () => this.goToNextTick(/^[\t ]*•/gm),
        },
        "tasklist-tools:translate-markdown": {
          description: "Rewrite the marks as Markdown task-list checkboxes.",
          didDispatch: () => this.translate(),
        },
        "tasklist-tools:move-items-to-next-header": {
          description: "Move the selected items under the next header.",
          didDispatch: () => this.moveItemsToNextHeader(),
        },
        "tasklist-tools:move-items-to-last-header": {
          description: "Move the selected items under the last header.",
          didDispatch: () => this.moveItemsToLastHeader(),
        },
        "tasklist-tools:move-to-next-header": {
          description: "Move the cursor to the next header in the file.",
          didDispatch: () => this.moveToNextHeader(),
        },
        "tasklist-tools:move-to-previous-header": {
          description: "Move the cursor to the previous header in the file.",
          didDispatch: () => this.moveToPreviousHeader(),
        },
        "tasklist-tools:move-to-last-header": {
          description: "Move the cursor to the last header in the file.",
          didDispatch: () => this.moveToLastHeader(),
        },
      }),
      lumine.config.observe("tasklist-tools.mouseToggle", (value) => {
        value ? this.activateHandler() : this.deactivateHandler();
      }),
      lumine.config.onDidChange("tasklist-tools.statusBar", (e) => {
        e.newValue ? this.activateStatusBar() : this.deactivateStatusBar();
      }),
    );
  },

  /**
   * The active editor, but only when it holds a tasklist. Every command here
   * rewrites lines with ▷ ☐ ✔ ✘ • glyphs, and the application menu dispatches
   * at whatever holds focus, so the grammar the keymap has always demanded has
   * to be checked here too.
   * @returns {TextEditor|null} the active tasklist editor, or null
   */
  tasklistEditor() {
    const editor = lumine.workspace.getActiveTextEditor();
    if (!editor) {
      return null;
    }
    if (!editor.getGrammar().scopeName.split(".").includes("tasklist")) {
      lumine.notifications.addWarning("Not a tasklist file");
      return null;
    }
    return editor;
  },

  /**
   * Deactivates the package and disposes resources.
   */
  deactivate() {
    this.disposables.dispose();
    this.deactivateHandler();
    this.deactivateStatusBar();
  },

  /**
   * Toggles or sets the task state at the current cursor position.
   * @param {string} [mode] - Optional task symbol to set
   */
  task(mode) {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    editor.mutateSelectedText((selection) => {
      const range = this.bufferRangeForSelectedRows(editor, selection);
      if (selection.isEmpty()) {
        const row = range[0][0];
        const lineText = editor.lineTextForBufferRow(row);
        if (!/^([\t ]*)(▷|☐|✔|✘|•)/.test(lineText)) {
          const indent = lineText.match(/^([\t ]*)/)[1].length;
          this.insertTick(editor, selection, new Point(row, indent), mode || "☐");
          return;
        }
      }
      this.tickMutate(editor, range, mode);
    });
  },

  bufferRangeForSelectedRows(editor, selection) {
    const selectionRange = selection.getBufferRange();
    let endRow = selectionRange.end.row;
    if (
      !selection.isEmpty() &&
      selectionRange.end.column === 0 &&
      endRow > selectionRange.start.row
    ) {
      endRow--;
    }
    return [
      [selectionRange.start.row, 0],
      [endRow, editor.lineTextForBufferRow(endRow).length],
    ];
  },

  insertTick(editor, selection, insertionPoint, symbol) {
    const cursorPosition = selection.getHeadBufferPosition();
    const text = `${symbol} `;
    editor.setTextInBufferRange([insertionPoint, insertionPoint], text);
    const cursorColumn =
      cursorPosition.column < insertionPoint.column
        ? cursorPosition.column
        : cursorPosition.column + text.length;
    const cursorPositionAfterInsert = new Point(cursorPosition.row, cursorColumn);
    selection.setBufferRange([cursorPositionAfterInsert, cursorPositionAfterInsert]);
  },

  tickMutate(editor, range, mode) {
    editor.scanInBufferRange(/^([\t ]*)(•|▷|☐|✔|✘)/gm, range, (iterator) => {
      let symbol;
      if (mode) {
        symbol = mode;
      } else if ("•▷☐".includes(iterator.match[2])) {
        symbol = `✔`;
      } else if (iterator.match[2] === "✔") {
        symbol = `✘`;
      } else if (iterator.match[2] === "✘") {
        symbol = `☐`;
      }
      editor.setTextInBufferRange(
        [[iterator.range.end.row, iterator.range.end.column - 1], iterator.range.end],
        symbol,
      );
    });
  },

  goToNextTick(regExp) {
    const editor = this.tasklistEditor();
    if (!editor) return;
    let curPos = editor.getCursorBufferPosition();
    let pass = false;
    editor.scanInBufferRange(
      regExp,
      [
        [curPos.row + 1, 0],
        [1e9, 1e9],
      ],
      (iterator) => {
        editor.setCursorBufferPosition([iterator.range.end.row, 1e9], { autoscroll: true });
        iterator.stop();
        pass = true;
      },
    );
    if (!pass) {
      editor.scanInBufferRange(
        regExp,
        [
          [0, 0],
          [curPos.row + 1, 0],
        ],
        (iterator) => {
          editor.setCursorBufferPosition([iterator.range.end.row, 1e9], { autoscroll: true });
          iterator.stop();
        },
      );
    }
  },

  translate() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    editor.transact(() => {
      editor.scan(/^([\t ]*)[-*] \[ \]/gm, (iterator) => {
        iterator.replace(`${iterator.match[1]}☐`);
      });
      editor.scan(/^([\t ]*)[-*] \[x\]/gim, (iterator) => {
        iterator.replace(`${iterator.match[1]}✔`);
      });
      editor.scan(/^([\t ]*)[-*]/gm, (iterator) => {
        iterator.replace(`${iterator.match[1]}•`);
      });
    });
  },

  moveItemsToBufferRow(editor, selection, destinationRow) {
    editor.transact(() => {
      let rbase = selection.getBufferRange();
      selection.setBufferRange([
        [rbase.start.row, 0],
        [rbase.end.row + (selection.isSingleScreenLine() || rbase.end.column > 0), 0],
      ]);
      let lineText = selection.getText();
      if (!lineText.endsWith("\n")) {
        lineText = lineText + "\n";
      }
      editor.setTextInBufferRange(
        [
          [destinationRow, 0],
          [destinationRow, 0],
        ],
        lineText,
      );
      selection.delete();
    });
  },

  moveItemsToLastHeader() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    editor.backwardsScanInBufferRange(
      /^[\t ]*([^▷☐✔✘• \n].*?) *(:) *$/,
      [Point.ZERO, Point.INFINITY],
      (iterator) => {
        editor.transact(() => {
          for (let selection of editor.getSelections()) {
            this.moveItemsToBufferRow(editor, selection, iterator.range.start.row + 1);
          }
          iterator.stop();
        });
      },
    );
  },

  moveItemsToNextHeader() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    editor.transact(() => {
      for (let selection of editor.getSelections()) {
        let rbase = selection.getBufferRange();
        editor.scanInBufferRange(
          /^[\t ]*([^▷☐✔✘• \n].*?) *(:) *$/,
          [rbase.start, Point.INFINITY],
          (iterator) => {
            this.moveItemsToBufferRow(editor, selection, iterator.range.start.row + 1);
            iterator.stop();
          },
        );
      }
    });
  },

  moveToLastHeader() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    editor.backwardsScanInBufferRange(
      /^[\t ]*([^▷☐✔✘• \n].*?) *(:) *$/,
      [Point.ZERO, Point.INFINITY],
      (iterator) => {
        editor.setCursorBufferPosition([iterator.range.start.row, Point.INFINITY.column]);
        iterator.stop();
      },
    );
  },

  moveToNextHeader() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    let cursor = editor.getLastCursor();
    let bufferPosition = cursor.getBufferPosition();
    editor.scanInBufferRange(
      /^[\t ]*([^▷☐✔✘• \n].*?) *(:) *$/,
      [[bufferPosition.row + 1, 0], Point.INFINITY],
      (iterator) => {
        editor.setCursorBufferPosition([iterator.range.start.row, Point.INFINITY.column]);
        iterator.stop();
      },
    );
  },

  moveToPreviousHeader() {
    const editor = this.tasklistEditor();
    if (!editor) {
      return;
    }
    let cursor = editor.getLastCursor();
    let bufferPosition = cursor.getBufferPosition();
    editor.backwardsScanInBufferRange(
      /^[\t ]*([^▷☐✔✘• \n].*?) *(:) *$/,
      [Point.ZERO, [bufferPosition.row - 1, Point.INFINITY.column]],
      (iterator) => {
        editor.setCursorBufferPosition([iterator.range.start.row, Point.INFINITY.column]);
        iterator.stop();
      },
    );
  },

  eventHandler(e) {
    const element = e.srcElement.closest("lumine-text-editor");
    if (e.which !== 2 || !element) {
      return;
    }
    let line = e.target.closest(".line[data-screen-row]");
    if (!line) {
      return;
    }
    const editor = element.getModel();
    if (!editor) {
      return;
    }
    e.stopPropagation();
    let screenRow = parseInt(line.getAttribute("data-screen-row"));
    let row = editor.bufferPositionForScreenPosition([screenRow, 0]).row;
    this.tickMutate(editor, [
      [row, 0],
      [row, 1e9],
    ]);
  },

  activateHandler() {
    lumine.workspace.getElement().addEventListener("mousedown", this.eventHandlerBinded, {
      capture: true,
      passive: true,
    });
  },

  deactivateHandler() {
    lumine.workspace.getElement().removeEventListener("mousedown", this.eventHandlerBinded, {
      capture: true,
      passive: true,
    });
  },

  consumeStatusBar(statusBar) {
    this.statusBar = statusBar;
    if (!lumine.config.get("tasklist-tools.statusBar")) {
      return;
    }
    this.activateStatusBar();
  },

  activateStatusBar() {
    if (!this.statusBar) {
      return;
    }
    this.tasklistStatus = new TasklistStatus();
    // Language-tooling band, see the priority convention in the status-bar
    // package README.
    this.statusBarTile = this.statusBar.addLeftTile({
      item: this.tasklistStatus,
      priority: 440,
    });
  },

  deactivateStatusBar() {
    if (!this.tasklistStatus) {
      return;
    }
    // Destroy the tile too, not just the view: the status bar keeps it in its
    // ordered collection and inserts later tiles relative to it, so a detached
    // item left behind there breaks the next insertion.
    this.statusBarTile?.destroy();
    this.statusBarTile = null;
    this.tasklistStatus.destroy();
    this.tasklistStatus = null;
  },
};
