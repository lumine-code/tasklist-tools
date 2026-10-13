const { CompositeDisposable } = require("lumine");

class TasklistStatus {
  constructor(context = {}) {
    this.document = context.document ?? document;
    this.container =
      context.editorContainer ?? lumine.workspace.getMainWindow().getEditorContainer();
    this.element = this.document.createElement("status-bar-tile");
    this.element.classList.add("tasklist-status");
    this.element.setAttribute("data-context-menu-boundary", "");
    this.ticks = [];
    this.createTick("high", "▷");
    this.createTick("todo", "☐");
    this.createTick("done", "✔");
    this.createTick("fail", "✘");
    this.createTick("info", "•");
    this.editor = null;
    const action = (label, command) => ({
      label,
      command: `tasklist-tools:${command}`,
      keyBindingTarget: () =>
        this.editor?.getGrammar().scopeName.split(".").includes("tasklist")
          ? this.editor.getElement()
          : null,
    });
    const types = ["High", "Todo", "Done", "Fail", "Info"];
    this.menuDisposable = lumine.contextMenu.add({
      ".tasklist-status": [
        { type: "separator" },
        {
          ...action("Go to Next Tick", "go-to-next-tick"),
          shouldDisplay: (event) => this.element.contains(event.target),
        },
        {
          ...action("Toggle Tasks", "toggle-tick"),
          shouldDisplay: (event) => this.element.contains(event.target),
        },
        { type: "separator" },
        {
          label: "Go to Next",
          shouldDisplay: (event) => this.element.contains(event.target),
          submenu: types.map((type) => action(type, `go-to-next-${type.toLowerCase()}`)),
        },
        {
          label: "Set as",
          shouldDisplay: (event) => this.element.contains(event.target),
          submenu: types.map((type) => action(type, `set-as-${type.toLowerCase()}`)),
        },
        { type: "separator" },
      ],
    });
    this.element.onmouseup = (e) => {
      if (!this.editor) return;
      if (e.button === 0 || e.which === 1) {
        if (process.platform === "darwin" && e.ctrlKey) return;
        lumine.commands.dispatch(this.element, "tasklist-tools:go-to-next-tick");
      } else if (e.button === 1 || e.which === 2) {
        lumine.commands.dispatch(this.element, "tasklist-tools:toggle-tick");
      }
    };
    this.tooltipDisposable = lumine.tooltips.add(this.element, {
      html: false,
      keyBindingCommand: "tasklist-tools:go-to-next-tick",
      keyBindingTarget: () => (this.editor ? lumine.views.getView(this.editor) : null),
      title: () => "Task counts. Click to go to the next task.",
    });
    this.subscribe();
  }

  subscribe() {
    this.oateSub = this.container.observeActiveEmbeddedTextEditor((editor) => {
      if (this.odscSub) {
        this.odscSub.dispose();
      }
      this.editor = editor ?? null;
      this.odscSub = editor
        ? new CompositeDisposable(
            editor.onDidStopChanging(() => this.update()),
            editor.onDidChangeGrammar(() => this.update()),
          )
        : null;
      this.update();
    });
  }

  destroy() {
    this.element.onmouseup = null;
    this.tooltipDisposable.dispose();
    this.menuDisposable.dispose();
    this.editor = null;
    this.oateSub.dispose();
    if (this.odscSub) {
      this.odscSub.dispose();
    }
    this.element.remove();
  }

  createTick(name, tick) {
    // A plain inline span, not `.inline-block`: a theme may give the tile a
    // fixed height, and an inline block inside one aligns on the baseline —
    // it grows to the tile's height and hangs past its bottom edge. Every
    // other multi-part tile in the bar lays its parts out inline.
    let el = this.document.createElement("span");
    el.id = `${name}-counter`;
    el.name = name;
    el.tick = tick;
    el.count = 0;
    el.regExp = new RegExp("^[\\t ]*" + el.tick, "gm");
    if (this.ticks.length > 0) {
      el.style.marginLeft = "0.5em";
    }

    let icon = this.document.createElement("span");
    icon.textContent = tick;
    icon.style.marginRight = "0.25em";
    el.appendChild(icon);

    let label = this.document.createElement("span");
    el.appendChild(label);
    el.label = label;

    this.element.appendChild(el);
    this.ticks.push(el);
  }

  updateTick(el, text) {
    el.count = (text.match(el.regExp) || []).length;
    el.label.textContent = el.count;
  }

  update() {
    if (!this.editor || this.editor.getGrammar().scopeName !== "text.tasklist") {
      return this.hide();
    }
    let text = this.editor.getText();
    for (let el of this.ticks) {
      this.updateTick(el, text);
    }
    this.element.style.display = "";
  }

  hide() {
    this.element.style.display = "none";
  }
}

module.exports = { TasklistStatus };
