// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { expect, test } from "vitest";
import { PlainTextClipboard } from "../src/vendor/open-knowledge/core/src/extensions/plain-text-clipboard";

test("PlainTextClipboard 通过 ProseMirror 复制纯文本且保留段间分隔", () => {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, PlainTextClipboard],
    content: "<p>首段 <strong>加粗</strong></p><p>次段</p>",
  });
  try {
    const { doc } = editor.state;
    const copied = editor.view.serializeForClipboard(doc.slice(0, doc.content.size));
    expect(copied.text).toBe("首段 加粗\n\n次段");
    expect(copied.dom.querySelector("strong")?.textContent).toBe("加粗");
  } finally {
    editor.destroy();
  }
});
