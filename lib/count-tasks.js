const TICKS = new Map([
  ["▷", 0],
  ["☐", 1],
  ["✔", 2],
  ["✘", 3],
  ["•", 4],
]);

// Fixed-size counters and one source chunk at a time. No match arrays and no
// complete line strings, including when indentation crosses chunk boundaries.
function countTasks(entries, { signal } = {}) {
  const counts = [0, 0, 0, 0, 0];
  const sources = entries[Symbol.iterator]();
  let entry,
    chunks,
    chunk = "",
    offset = 0,
    atStart = true;
  const endings = /[\r\n\u2028\u2029]/g;
  const advance = () => {
    const deadline = performance.now() + 4;
    let visited = 0;
    for (;;) {
      signal?.throwIfAborted();
      if (!chunks) {
        const next = sources.next();
        if (next.done) return counts;
        entry = next.value;
        chunks = entry.source.chunks();
        atStart = true;
      }
      if (offset >= chunk.length) {
        const next = chunks.next();
        if (next.done) {
          chunks = null;
          continue;
        }
        chunk = next.value;
        offset = 0;
      }
      if (atStart) {
        while (offset < chunk.length && (chunk[offset] === " " || chunk[offset] === "\t")) offset++;
        if (offset < chunk.length) {
          const index = TICKS.get(chunk[offset]);
          if (index !== undefined) counts[index] += entry.sign;
          atStart = false;
        }
      }
      if (!atStart) {
        endings.lastIndex = offset;
        const ending = endings.exec(chunk);
        if (ending) {
          offset = endings.lastIndex;
          atStart = true;
        } else offset = chunk.length;
      }
      if (++visited % 8 === 0 && performance.now() >= deadline)
        return new Promise((resolve) => setTimeout(resolve, 0)).then(advance);
    }
  };
  return advance();
}

function rowsSource(source, range) {
  const start = source.lineStart(range.start.row);
  const end =
    range.end.row + 1 < source.lineCount ? source.lineStart(range.end.row + 1) : source.length;
  return source.subtext(start, end);
}

module.exports = { countTasks, rowsSource };
