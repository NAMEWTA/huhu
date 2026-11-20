import DiffMatchPatch from "diff-match-patch";
import * as Y from "yjs";
import { FILE_LOAD_ORIGIN } from "./doc-source";

const BOM = "\uFEFF";
const lineEndings = /\r\n|\r|\n/g;
const finalLineEnding = /(?:\r\n|\r|\n)$/;
const diff = new DiffMatchPatch();

export function markdownFileBody(text: string): string {
  return (text.startsWith(BOM) ? text.slice(1) : text).replace(lineEndings, "\n");
}

/** The editor uses LF offsets. The host restores the separators of surviving line breaks. */
export function restoreMarkdownFileEnvelope(source: string, body: string, preserveFinalNewline = true): string {
  const bom = source.startsWith(BOM) ? BOM : "";
  const endings = source.match(lineEndings) ?? [];
  const ending = endings[0] ?? "\n";
  body = body.replace(lineEndings, "\n");
  if (bom && preserveFinalNewline && body.endsWith("\n") && !finalLineEnding.test(source)) {
    body = body.slice(0, -1);
  }
  if (endings.every((next) => next === ending)) return bom + body.replaceAll("\n", ending);

  // Match the normalized buffers so edits inside a line preserve its separator too.
  let line = 0;
  let previousEnding = ending;
  return (
    bom +
    diff
      .diff_main(markdownFileBody(source), body, false)
      .map(([operation, text]) => {
        if (operation === DiffMatchPatch.DIFF_INSERT) return text.replaceAll("\n", previousEnding);
        const restored = text.replaceAll("\n", () => (previousEnding = endings[line++] ?? ending));
        return operation === DiffMatchPatch.DIFF_DELETE ? "" : restored;
      })
      .join("")
  );
}

export function hasMixedMarkdownLineEndings(source: string): boolean {
  const endings = source.match(lineEndings) ?? [];
  return endings.some((ending) => ending !== endings[0]);
}

type TextDelta = readonly { retain?: number; delete?: number; insert?: unknown }[];

/** Apply editing offsets to the original mixed separators before coalescing edits. */
export function applyMarkdownFileDelta(source: string, changes: TextDelta): string | null {
  const hasBom = source.startsWith(BOM);
  let offset = hasBom ? 1 : 0;
  let ending = source.match(lineEndings)?.[0] ?? "\n";
  let file = hasBom ? BOM : "";
  for (const change of changes) {
    if (change.insert !== undefined) {
      if (typeof change.insert !== "string") return null;
      file += change.insert.replace(lineEndings, ending);
      continue;
    }
    const start = offset;
    const count = change.retain ?? change.delete ?? 0;
    for (let consumed = 0; consumed < count; consumed++) {
      if (offset >= source.length) return null;
      const c = source[offset++];
      if (c === "\r" || c === "\n") {
        const separator = c === "\r" && source[offset] === "\n" ? c + source[offset++] : c;
        if (change.retain !== undefined) ending = separator;
      }
    }
    if (change.retain !== undefined) file += source.slice(start, offset);
  }
  return file + source.slice(offset);
}

type Separator = { id: Y.ID; ending: string };
const deletedSeparators = Symbol("markdown deleted separators");
const separatorKey = ({ client, clock }: Y.ID) => `${client}:${clock}`;

/** Match the actual LF characters in Y.Text, including adjacent identical lines. */
function separatorsIn(text: Y.Text): Y.ID[] {
  const ids: Y.ID[] = [];
  for (const item of Y.getTypeChildren(text)) {
    if (item.deleted || !(item.content instanceof Y.ContentString)) continue;
    const content = item.content.str;
    for (let at = content.indexOf("\n"); at !== -1; at = content.indexOf("\n", at + 1)) {
      ids.push(Y.createID(item.id.client, item.id.clock + at));
    }
  }
  return ids;
}

function restoredSeparator(doc: Y.Doc, id: Y.ID): Y.ID {
  let item = Y.getItem(doc.store, id);
  while (item.redone) {
    id = Y.createID(item.redone.client, item.redone.clock + id.clock - item.id.clock);
    item = Y.getItem(doc.store, id);
  }
  return id;
}

/** Keep deleted separators on the same undo stack items as their Y.Text characters. */
export function observeMarkdownFileHistory(text: Y.Text, state: { current: string | null }, getHistory: () => Y.UndoManager): () => void {
  const doc = text.doc!;
  let previous = new Map<string, Separator>();
  let indexedFile = state.current;
  let pending: { transaction: Y.Transaction; history: Y.UndoManager; removed: Separator[] } | undefined;

  function readSeparators(file: string): Map<string, Separator> {
    const endings = file.match(lineEndings) ?? [];
    return new Map(separatorsIn(text).map((id, index) => [separatorKey(id), { id, ending: endings[index] ?? "\n" }]));
  }

  if (state.current !== null) previous = readSeparators(state.current);
  const observe = (event: Y.YTextEvent, transaction: Y.Transaction) => {
    const file = state.current;
    if (file === null || transaction.origin === FILE_LOAD_ORIGIN) {
      previous = file === null ? new Map() : readSeparators(file);
      indexedFile = file;
      return;
    }
    // An external save can change only line endings, leaving Y.Text unchanged.
    if (file !== indexedFile) {
      const endings = file.match(lineEndings) ?? [];
      let index = 0;
      for (const separator of previous.values()) separator.ending = endings[index++] ?? "\n";
    }
    const next = applyMarkdownFileDelta(file, event.delta);
    state.current = next;
    if (next === null) return;

    const history = getHistory();
    const current = readSeparators(next);
    const removed = [...previous.values()].filter(({ id }) => Y.isDeleted(transaction.deleteSet, id));
    pending = { transaction, history, removed };
    const popped = transaction.origin === history ? history.currStackItem : null;
    const restored = popped?.meta.get(deletedSeparators) as Separator[] | undefined;
    if (restored?.length) {
      for (const { id, ending } of restored) {
        const separator = current.get(separatorKey(restoredSeparator(doc, id)));
        if (separator) separator.ending = ending;
      }
      const endings = current.values();
      state.current = next.replace(lineEndings, (ending) => endings.next().value?.ending ?? ending);
    }
    previous = current;
    indexedFile = state.current;
  };
  const capture = (transaction: Y.Transaction) => {
    if (pending?.transaction !== transaction) return;
    const { history, removed } = pending;
    pending = undefined;
    const stack = history.undoing ? history.redoStack : history.undoStack;
    const item = stack.at(-1);
    if (!item || removed.length === 0) return;
    const captured = removed.filter(({ id }) => Y.isDeleted(item.deletions, id) && !Y.isDeleted(item.insertions, id));
    if (captured.length === 0) return;
    const saved = (item.meta.get(deletedSeparators) as Separator[] | undefined) ?? [];
    saved.push(...captured);
    item.meta.set(deletedSeparators, saved);
  };
  text.observe(observe);
  doc.on("afterTransactionCleanup", capture);
  return () => {
    text.unobserve(observe);
    doc.off("afterTransactionCleanup", capture);
  };
}
