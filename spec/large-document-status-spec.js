const { TextBuffer } = require("lumine");

describe("task counts over immutable sources", () => {
  beforeEach(() => jasmine.useRealClock());
  it("counts every multiline anchor form across source chunk boundaries without match arrays", async () => {
    const { countTasks } = require("../lib/count-tasks");
    const source = {
      *chunks() {
        yield " \t";
        yield "☐ first\r";
        yield "✔ second\u2028✘ third\u2029• note\n▷ last";
      },
    };
    expect(await countTasks([{ source, sign: 1 }])).toEqual([1, 1, 1, 1, 1]);
  });

  it("yields and can cancel a long indentation without publishing partial counters", async () => {
    const { countTasks } = require("../lib/count-tasks");
    const controller = new AbortController();
    let visited = 0;
    const source = {
      *chunks() {
        for (let i = 0; i < 10000; i++) {
          visited++;
          yield " ".repeat(32768);
        }
        yield "☐";
      },
    };
    const pending = countTasks([{ source, sign: 1 }], { signal: controller.signal });
    expect(typeof pending.then).toBe("function");
    controller.abort();
    await expectAsync(pending).toBeRejected();
    expect(visited).toBeLessThan(10000);
  });

  it("derives exact deltas from complete old/new rows around a newline insertion", async () => {
    const { countTasks, rowsSource } = require("../lib/count-tasks");
    const buffer = new TextBuffer({ text: "☐ one\n✔ two\n" });
    const before = buffer.getTextSnapshot();
    let change;
    buffer.onDidApplyChanges((event) => {
      change = event.changes[0];
    });
    buffer.insert([0, 2], "\n✘ ");
    const after = buffer.getTextSnapshot();
    const delta = await countTasks([
      { source: rowsSource(before, change.oldRange), sign: -1 },
      { source: rowsSource(after, change.newRange), sign: 1 },
    ]);
    expect(delta).toEqual([0, 0, 0, 1, 0]);
    buffer.destroy();
  });
});

describe("large tasklist status lifecycle", () => {
  let editor, status;
  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("language-tasklist");
    await lumine.packages.activatePackage("status-bar");
    editor = await lumine.workspace.open();
    editor.setGrammar(lumine.grammars.grammarForScopeName("text.tasklist"));
    editor.setText("☐ task\n".repeat(50000));
    status = (await lumine.packages.activatePackage("tasklist-tools")).mainModule.tasklistStatus;
    await conditionPromise(
      () => status.cachedCount?.revision === editor.getBuffer().getTextRevision(),
    );
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("tasklist-tools");
    editor.destroy();
  });

  it("updates a local edit from row windows without recounting the full document", () => {
    const source = status.cachedCount.source;
    const prototype = Object.getPrototypeOf(source);
    const originalChunks = prototype.chunks;
    let largestRead = 0;
    const chunks = spyOn(prototype, "chunks").and.callFake(function () {
      largestRead = Math.max(largestRead, this.length);
      if (this.length > 1000) throw new Error("full document recount");
      return originalChunks.call(this);
    });
    const text = spyOn(editor.getBuffer(), "getText").and.throwError("full string");
    try {
      editor.getBuffer().setTextInRange(
        [
          [25000, 0],
          [25000, 1],
        ],
        "✔",
      );
      status.update();
      expect(status.ticks.map((tick) => tick.count)).toEqual([0, 49999, 1, 0, 0]);
      expect(largestRead).toBeLessThan(1000);
      expect(chunks).toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
    } finally {
      chunks.and.callThrough();
      text.and.callThrough();
    }
    editor.undo();
    status.update();
    expect(status.ticks.map((tick) => tick.count)).toEqual([0, 50000, 0, 0, 0]);
  });

  it("cannot publish a stale count after changing to None", () => {
    status.cachedCount = null;
    status.update();
    editor.setGrammar(lumine.grammars.nullGrammar);
    expect(status.pendingCount).toBeNull();
    expect(status.cachedCount).toBeNull();
    expect(status.element.style.display).toBe("none");
  });
});
