const { CompositeDisposable } = require("lumine");
const TICKS = new Set(["▷", "☐", "✔", "✘", "•"]);
const sourceLines = require("./source-lines");

async function run(editor, work, { mutating = true } = {}) {
  this.sourceCommands?.get(editor)?.abort();
  const controller = new AbortController();
  (this.sourceCommands ??= new Map()).set(editor, controller);
  const owner = this.disposables;
  const buffer = editor.getBuffer();
  const source = buffer.getTextSnapshot();
  const revision = buffer.getTextRevision();
  const grammar = editor.getGrammar();
  const isCurrent = () =>
    !controller.signal.aborted &&
    this.disposables === owner &&
    !editor.isDestroyed() &&
    (!mutating || !editor.isReadOnly()) &&
    editor.getBuffer() === buffer &&
    buffer.getTextRevision() === revision &&
    editor.getGrammar() === grammar;
  const subscriptions = new CompositeDisposable(
    buffer.onDidChange(() => controller.abort()),
    editor.onDidChangeSelectionRange(() => controller.abort()),
    editor.onDidChangeGrammar(() => controller.abort()),
    editor.onDidDestroy(() => controller.abort()),
  );
  let deadline = performance.now() + 4;
  const context = {
    editor,
    buffer,
    source,
    revision,
    signal: controller.signal,
    isCurrent,
    check() {
      if (!isCurrent())
        throw Object.assign(new Error("Task operation is stale"), { name: "AbortError" });
    },
    async cooperate() {
      this.check();
      if (performance.now() >= deadline) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        this.check();
        deadline = performance.now() + 4;
      }
    },
  };
  try {
    context.check();
    return await work(context);
  } catch (error) {
    if ((!controller.signal.aborted && error.name !== "AbortError") || error.committed)
      lumine.notifications.addError(
        error.committed ? "Tasks changed, but an observer failed" : "Unable to update tasks",
        { detail: error.message, dismissable: true },
      );
  } finally {
    subscriptions.dispose();
    if (this.sourceCommands?.get(editor) === controller) this.sourceCommands.delete(editor);
  }
}

function selectedRows(editor) {
  const spans = editor
    .getSelectedBufferRanges()
    .map((range) => ({
      start: range.start.row,
      end:
        range.end.row -
        (!range.isEmpty() && range.end.column === 0 && range.end.row > range.start.row ? 1 : 0),
    }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.start <= last.end + 1) last.end = Math.max(last.end, span.end);
    else merged.push(span);
  }
  return merged;
}

async function mutate(context, mode) {
  const { editor, buffer } = context;
  const rows = selectedRows(editor);
  const emptySelections = editor
    .getSelections()
    .filter((selection) => selection.isEmpty())
    .map((selection) => ({ selection, position: selection.getHeadBufferPosition().copy() }));
  const emptyRows = new Set(emptySelections.map(({ position }) => position.row));
  const inserted = new Map();
  async function* edits() {
    let batch = [];
    for (const span of rows) {
      const start = context.source.lineStart(span.start);
      const end =
        span.end + 1 < context.source.lineCount
          ? context.source.lineStart(span.end + 1)
          : context.source.length;
      for await (const lines of sourceLines(context, start, end))
        for (const entry of lines) {
          const row = entry.row;
          if (row > span.end || inserted.has(row)) continue;
          if (TICKS.has(entry.character)) {
            const text =
              mode || ("•▷☐".includes(entry.character) ? "✔" : entry.character === "✔" ? "✘" : "☐");
            if (text !== entry.character)
              batch.push({
                range: [
                  [row, entry.at - entry.rowStart],
                  [row, entry.at - entry.rowStart + 1],
                ],
                text,
              });
          } else if (emptyRows.has(row) && entry.start === entry.rowStart) {
            const column = entry.at - entry.rowStart;
            inserted.set(row, column);
            batch.push({
              range: [
                [row, column],
                [row, column],
              ],
              text: `${mode || "☐"} `,
            });
          }
          if (batch.length >= 512) {
            yield batch;
            batch = [];
          }
          await context.cooperate();
        }
    }
    if (batch.length) yield batch;
  }
  return buffer.applyTextEdits(edits(), {
    expectedRevision: context.revision,
    signal: context.signal,
    isCurrent: context.isCurrent,
    didCommit() {
      for (const { selection, position } of emptySelections) {
        const column = inserted.get(position.row);
        if (column !== undefined && position.column >= column) {
          const point = [position.row, position.column + 2];
          selection.setBufferRange([point, point]);
        }
      }
    },
  });
}

async function translate(context) {
  const { source, buffer } = context;
  async function* edits() {
    let batch = [];
    for await (const lines of sourceLines(context, 0, source.length))
      for (const entry of lines) {
        const row = entry.row;
        if (entry.character === "-" || entry.character === "*") {
          const text = source.slice(entry.at, Math.min(entry.end, entry.at + 5));
          const checkbox = /^[-*] \[([ x])\]/i.exec(text);
          const count = checkbox ? 5 : 1;
          batch.push({
            range: [
              [row, entry.at - entry.rowStart],
              [row, entry.at - entry.rowStart + count],
            ],
            text: checkbox ? (checkbox[1] === " " ? "☐" : "✔") : "•",
          });
        }
        if (batch.length >= 512) {
          yield batch;
          batch = [];
        }
        await context.cooperate();
      }
    if (batch.length) yield batch;
  }
  return buffer.applyTextEdits(edits(), {
    expectedRevision: context.revision,
    signal: context.signal,
    isCurrent: context.isCurrent,
  });
}

async function nextTick(context, regex) {
  const { source, editor } = context;
  const start = editor.getCursorBufferPosition().row + 1;
  const test = new RegExp(regex.source, regex.flags.replaceAll("g", "").replaceAll("y", ""));
  for (const [first, end] of [
    [start, source.lineCount],
    [0, Math.min(start, source.lineCount)],
  ]) {
    if (first >= source.lineCount || first >= end) continue;
    const from = source.lineStart(first);
    const to = end < source.lineCount ? source.lineStart(end) : source.length;
    for await (const lines of sourceLines(context, from, to))
      for (const entry of lines) {
        if (test.test(entry.character)) {
          context.check();
          editor.setCursorBufferPosition([entry.row, Infinity], { mode: "zone" });
          return;
        }
        await context.cooperate();
      }
  }
}

async function findHeader(context, first, direction, startColumn = 0) {
  const { source } = context;
  for (let row = first; row >= 0 && row < source.lineCount; row += direction) {
    const start = source.lineStart(row) + (row === first ? startColumn : 0);
    const end = row + 1 < source.lineCount ? source.lineStart(row + 1) : source.length;
    for await (const lines of sourceLines(context, start, end))
      for (const entry of lines) {
        if (
          entry.character &&
          !TICKS.has(entry.character) &&
          entry.lastCharacter === ":" &&
          entry.lastNonSpace > entry.at
        )
          return row;
      }
    await context.cooperate();
  }
  return null;
}

async function navigateHeader(context, kind) {
  const row = context.editor.getCursorBufferPosition().row;
  const direction = kind === "next" ? 1 : -1;
  const first = kind === "last" ? context.source.lineCount - 1 : row + direction;
  const found = await findHeader(context, first, direction);
  if (found != null) {
    context.check();
    context.editor.setCursorBufferPosition([found, Infinity], { mode: "zone" });
  }
}

async function moveItems(context, last, apply) {
  const { editor } = context;
  const plans = [];
  const lastHeader = last ? await findHeader(context, context.source.lineCount - 1, -1) : null;
  for (const selection of editor.getSelections()) {
    const start = selection.getBufferRange().start;
    const row = last ? lastHeader : await findHeader(context, start.row, 1, start.column);
    if (row != null) plans.push({ selection, row: row + 1 });
  }
  context.check();
  const markers = plans.map(({ row }) =>
    editor.markBufferPosition([row, 0], { invalidate: "never" }),
  );
  try {
    editor.transact(() => {
      plans.forEach(({ selection, row }, index) => {
        const position = markers[index].getStartBufferPosition();
        const afterLastLine = row === context.source.lineCount;
        apply(editor, selection, position.row + (afterLastLine ? 1 : 0));
      });
    });
  } finally {
    markers.forEach((marker) => marker.destroy());
  }
}

module.exports = { run, mutate, translate, nextTick, navigateHeader, moveItems };
