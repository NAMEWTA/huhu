import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { expect, test } from "vitest";
import * as Y from "yjs";
import { documentHistory } from "../src/vendor/open-knowledge/app/src/editor/document-history";

test("a pooled document reuses its history while mounted and renews it after an uncached view destroys it", () => {
  const doc = new Y.Doc();
  try {
    const first = documentHistory(doc);
    expect(documentHistory(doc)).toBe(first);
    first.destroy();

    const second = documentHistory(doc);
    expect(second).not.toBe(first);
    expect(documentHistory(doc)).toBe(second);
    doc.transact(() => doc.getText("source").insert(0, "edited"), ySyncPluginKey);
    expect(second.canUndo()).toBe(true);
    second.undo();
    expect(doc.getText("source").toString()).toBe("");
  } finally {
    doc.destroy();
  }
});
