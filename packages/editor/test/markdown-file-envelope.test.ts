// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { yCollab, ySyncFacet } from "y-codemirror.next";
import * as Y from "yjs";
import { documentHistory } from "../src/vendor/open-knowledge/app/src/editor/document-history";
import { expect, test } from "vitest";
import { applyMarkdownFileDelta, markdownFileBody, observeMarkdownFileHistory, restoreMarkdownFileEnvelope } from "../src/host/markdown-file-envelope";

test.each(["first\r\nSECOND\r\n", "\uFEFFfirst\r\nSECOND\nthird\r"])("source offsets and original separators agree for %j", (file) => {
  const body = markdownFileBody(file);
  expect(body).not.toMatch(/[\r\uFEFF]/);
  expect(restoreMarkdownFileEnvelope(file, body.replace("SECOND", "XECOND"), false)).toBe(file.replace("SECOND", "XECOND"));
});

test("mixed separators follow actual editing offsets when adjacent lines repeat", () => {
  const file = "\uFEFFsame\r\nsame\nsame\r";
  expect(applyMarkdownFileDelta(file, [{ delete: 5 }])).toBe("\uFEFFsame\nsame\r");
  expect(applyMarkdownFileDelta(file, [{ retain: 5 }, { delete: 5 }])).toBe("\uFEFFsame\r\nsame\r");
});

test("CodeMirror undo and redo restore the file bytes after each delivery", () => {
  const original = "A\r\nB\nC\r\n";
  const doc = new Y.Doc();
  const source = doc.getText("source");
  source.insert(0, markdownFileBody(original));
  const history = documentHistory(doc);
  const parent = document.createElement("div");
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: source.toString(), extensions: [yCollab(source, null, { undoManager: false })] }),
  });
  history.addTrackedOrigin(view.state.facet(ySyncFacet));
  const file: { current: string | null } = { current: original };
  const stop = observeMarkdownFileHistory(source, file, () => history);
  try {
    view.dispatch({ changes: { from: 3, to: 4 } });
    expect(Buffer.from(file.current!)).toEqual(Buffer.from("A\r\nBC\r\n"));
    history.undo();
    expect(Buffer.from(file.current!)).toEqual(Buffer.from(original));
    history.redo();
    expect(Buffer.from(file.current!)).toEqual(Buffer.from("A\r\nBC\r\n"));
    history.undo();
    expect(Buffer.from(file.current!)).toEqual(Buffer.from(original));
  } finally {
    stop();
    view.destroy();
    doc.destroy();
  }
});
