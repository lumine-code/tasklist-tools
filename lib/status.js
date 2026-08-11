class TasklistStatus {
  constructor() {
    this.element = document.createElement("status-bar-tile");
    this.element.classList.add("tasklist-status");
    this.ticks = [];
    this.createTick("high", "▷");
    this.createTick("todo", "☐");
    this.createTick("done", "✔");
    this.createTick("fail", "✘");
    this.createTick("info", "•");
    this.editor = null;
    this.element.onmouseup = (e) => {
      const editorView = lumine.views.getView(lumine.workspace.getActiveTextEditor());
      if (e.which === 1) {
        lumine.commands.dispatch(editorView, "tasklist-tools:go-to-next-tick");
      } else if (e.which === 3) {
        lumine.commands.dispatch(editorView, "tasklist-tools:toggle-tick");
      }
    };
    this.tooltipDisposable = lumine.tooltips.addComposite(this.element, [
      {
        title: "Go to next tick",
        keyBindingExtra: "LMB",
        keyBindingCommand: "tasklist-tools:go-to-next-tick",
      },
      {
        title: "Toggle tick",
        keyBindingExtra: "RMB",
        keyBindingCommand: "tasklist-tools:toggle-tick",
      },
    ]);
    this.subscribe();
  }

  subscribe() {
    this.oateSub = lumine.workspace.observeActiveTextEditor((editor) => {
      if (this.odscSub) {
        this.odscSub.dispose();
      }
      if (editor && editor.getGrammar().scopeName === "text.tasklist") {
        this.editor = editor;
        this.update();
        this.odscSub = editor.onDidStopChanging(() => {
          this.update();
        });
      } else {
        this.hide();
      }
    });
  }

  destroy() {
    this.tooltipDisposable.dispose();
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
    let el = document.createElement("span");
    el.id = `${name}-counter`;
    el.name = name;
    el.tick = tick;
    el.count = 0;
    el.regExp = new RegExp("^[\\t ]*" + el.tick, "gm");
    if (this.ticks.length > 0) {
      el.style.marginLeft = "0.5em";
    }

    let icon = document.createElement("span");
    icon.textContent = tick;
    icon.style.marginRight = "0.25em";
    el.appendChild(icon);

    let label = document.createElement("span");
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
    if (!this.editor) {
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
