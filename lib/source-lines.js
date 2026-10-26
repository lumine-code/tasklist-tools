// ECMAScript multiline anchors include CR, LF and the two Unicode line
// separators. Keep those exact lexical boundaries while retaining the
// editor's physical LF-based row/column coordinates for edits and navigation.
async function* sourceLines(context, start, end) {
  const { source } = context;
  const position = source.positionAt(start);
  let row = position.row,
    rowStart = source.lineStart(row),
    lineStart = start;
  let first = null,
    character = "",
    lastNonSpace = null,
    lastCharacter = "";
  let eligible = start === 0 || [10, 13, 0x2028, 0x2029].includes(source.charCodeAt(start - 1));
  const endings = /[\r\n\u2028\u2029]/g;
  let batch = [];
  const finish = (lineEnd) => {
    if (eligible)
      batch.push({
        start: lineStart,
        end: lineEnd,
        at: first ?? lineEnd,
        character,
        lastNonSpace,
        lastCharacter,
        row,
        rowStart,
      });
  };
  for (let offset = start; offset < end; offset += 16384) {
    context.check();
    const chunk = source.slice(offset, Math.min(end, offset + 16384));
    let cursor = 0;
    while (cursor < chunk.length) {
      endings.lastIndex = cursor;
      const ending = endings.exec(chunk);
      const next = ending ? ending.index : chunk.length;
      const text = chunk.slice(cursor, next);
      if (first == null) {
        const index = text.search(/[^ \t]/);
        if (index >= 0) {
          first = offset + cursor + index;
          character = text[index];
        }
      }
      const contentLength = text.length - text.match(/ *$/)[0].length;
      if (contentLength) {
        lastNonSpace = offset + cursor + contentLength - 1;
        lastCharacter = text[contentLength - 1];
      }
      if (!ending) break;
      finish(offset + next);
      if (chunk[next] === "\n") {
        row++;
        rowStart = offset + next + 1;
      }
      lineStart = offset + next + 1;
      first = lastNonSpace = null;
      character = lastCharacter = "";
      eligible = true;
      cursor = next + 1;
      if (batch.length >= 512) {
        yield batch;
        batch = [];
        await context.cooperate();
      }
    }
    await context.cooperate();
  }
  finish(end);
  if (batch.length) yield batch;
}

module.exports = sourceLines;
