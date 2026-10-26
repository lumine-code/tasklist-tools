const { CompositeDisposable } = require("lumine");
const { countTasks, rowsSource } = require("./count-tasks");

class TasklistStatus {
  constructor(context = {}) {
    this.document = context.document ?? document;
    this.container =
      context.editorContainer ?? lumine.workspace.getMainWindow().getEditorContainer();
    this.element = this.document.createElement("status-bar-tile");
    this.element.classList.add("tasklist-status");
    this.element.setAttribute("data-context-menu-boundary", "");
    this.emptyIcon = this.document.createElement("span");
    this.emptyIcon.classList.add("tasklist-status-empty", "icon", "icon-checklist");
    this.emptyIcon.setAttribute("aria-hidden", "true");
    this.emptyIcon.style.setProperty("--ui-icon-spacing", "0px");
    this.element.appendChild(this.emptyIcon);
    this.ticks = [];
    this.createTick("high", "▷");
    this.createTick("todo", "☐");
    this.createTick("done", "✔");
    this.createTick("fail", "✘");
    this.createTick("info", "•");
    this.editor = null;
    this.countGeneration = 0;
    const action = (label, command) => ({
      label,
      command: `tasklist-tools:${command}`,
    });
    const types = [
      ["high", "High Priority"],
      ["todo", "To Do"],
      ["done", "Done"],
      ["fail", "Failed"],
      ["info", "Note"],
    ];
    this.menuDisposable = lumine.contextMenu.add({
      ".tasklist-status": {
        commandTarget: "focus",
        items: [
          { type: "separator" },
          {
            ...action("Go to Next Marked Line", "go-to-next-tick"),
            shouldDisplay: (event) => this.element.contains(event.target),
          },
          {
            ...action("Cycle Task State", "toggle-tick"),
            shouldDisplay: (event) => this.element.contains(event.target),
          },
          { type: "separator" },
          {
            label: "Go to Next",
            shouldDisplay: (event) => this.element.contains(event.target),
            submenu: types.map(([type, label]) => action(label, `go-to-next-${type}`)),
          },
          {
            label: "Set Task State",
            shouldDisplay: (event) => this.element.contains(event.target),
            submenu: types.map(([type, label]) => action(label, `set-as-${type}`)),
          },
          { type: "separator" },
        ],
      },
    });
    this.element.onmouseup = (e) => {
      if (!this.editor) return;
      if (e.button === 0 || e.which === 1) {
        if (process.platform === "darwin" && e.ctrlKey) return;
        lumine.commands.dispatch(this.editor.getElement(), "tasklist-tools:go-to-next-tick");
      } else if (e.button === 1 || e.which === 2) {
        lumine.commands.dispatch(this.editor.getElement(), "tasklist-tools:toggle-tick");
      }
    };
    this.tooltipDisposable = lumine.tooltips.add(this.element, {
      html: false,
      keyBindingCommand: "tasklist-tools:go-to-next-tick",
      keyBindingTarget: () => (this.editor ? lumine.views.getView(this.editor) : null),
      title: () =>
        this.pendingCount?.publish
          ? "Counting tasks…"
          : this.ticks.some((tick) => tick.count > 0)
            ? "Task counts. Click to go to the next task."
            : "No marked lines in this tasklist.",
    });
    this.subscribe();
  }

  subscribe() {
    this.oateSub = this.container.observeActiveEmbeddedTextEditor((editor) => {
      this.cancelCount();
      this.cachedCount = null;
      if (this.odscSub) {
        this.odscSub.dispose();
      }
      this.editor = editor ?? null;
      this.odscSub = editor
        ? new CompositeDisposable(
            editor.getBuffer().onDidApplyChanges((event) => this.sourceChanged(event)),
            editor.onDidStopChanging(() => this.update()),
            editor.onDidChangeGrammar(() => this.update()),
          )
        : null;
      this.update();
    });
  }

  destroy() {
    this.destroyed = true;
    this.cancelCount();
    this.cachedCount = null;
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
    el.hidden = true;

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

  updateTick(el, count) {
    el.count = count;
    el.label.textContent = el.count;
    el.hidden = el.count === 0;
  }

  update() {
    if (!this.editor || this.editor.getGrammar().scopeName !== "text.tasklist") {
      this.cancelCount();
      this.cachedCount = null;
      return this.hide();
    }
    const buffer = this.editor.getBuffer();
    const revision = buffer.getTextRevision();
    if (this.cachedCount?.buffer === buffer && this.cachedCount.revision === revision)
      return this.renderCounts(this.cachedCount.counts);
    if (this.pendingCount?.buffer === buffer && this.pendingCount.revision === revision) {
      this.pendingCount.publish = true;
      this.element.setAttribute("aria-busy", "true");
      this.element.style.display = "";
      return;
    }
    this.cancelCount();
    const source = buffer.getTextSnapshot();
    this.beginCount(buffer, source, revision, [{ source, sign: 1 }], [0, 0, 0, 0, 0], true);
  }

  renderCounts(counts) {
    this.element.removeAttribute("aria-busy");
    let hasTicks = false;
    for (const [index, el] of this.ticks.entries()) {
      this.updateTick(el, counts[index]);
      el.style.marginLeft = !el.hidden && hasTicks ? "0.5em" : "";
      if (!el.hidden) hasTicks = true;
    }
    this.emptyIcon.hidden = hasTicks;
    this.element.style.display = "";
  }

  cancelCount() {
    this.countGeneration++;
    this.pendingCount?.controller.abort();
    this.pendingCount = null;
    this.element.removeAttribute("aria-busy");
  }

  sourceChanged(event) {
    const previous = this.cachedCount;
    this.cachedCount = null;
    this.cancelCount();
    const editor = this.editor;
    const buffer = editor?.getBuffer();
    if (
      !previous ||
      previous.buffer !== buffer ||
      previous.revision !== event.beforeRevision ||
      event.changes.length !== 1 ||
      !event.isCurrent() ||
      editor.getGrammar().scopeName !== "text.tasklist"
    )
      return;
    const change = event.changes[0];
    const source = buffer.getTextSnapshot();
    this.beginCount(
      buffer,
      source,
      event.afterRevision,
      [
        { source: rowsSource(previous.source, change.oldRange), sign: -1 },
        { source: rowsSource(source, change.newRange), sign: 1 },
      ],
      previous.counts,
      false,
    );
  }

  beginCount(buffer, source, revision, entries, base, publish) {
    const state = { buffer, source, revision, publish, controller: new AbortController() };
    const generation = this.countGeneration;
    this.pendingCount = state;
    const finish = (delta) => {
      if (
        this.destroyed ||
        this.countGeneration !== generation ||
        this.pendingCount !== state ||
        this.editor?.getBuffer() !== buffer ||
        buffer.getTextRevision() !== revision ||
        this.editor.getGrammar().scopeName !== "text.tasklist"
      )
        return;
      this.pendingCount = null;
      const counts = base.map((value, index) => value + delta[index]);
      this.cachedCount = { buffer, source, revision, counts };
      if (state.publish) this.renderCounts(counts);
    };
    const result = countTasks(entries, { signal: state.controller.signal });
    if (result?.then) {
      if (publish) {
        this.element.setAttribute("aria-busy", "true");
        this.element.style.display = "";
      }
      result.then(finish).catch((error) => {
        if (state.controller.signal.aborted) return;
        if (this.pendingCount === state) {
          this.pendingCount = null;
          this.hide();
        }
        console.error("Unable to count tasklist entries", error);
      });
    } else finish(result);
  }

  hide() {
    this.element.style.display = "none";
  }
}

module.exports = { TasklistStatus };
