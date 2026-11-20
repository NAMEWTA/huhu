// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { expect, test, vi } from "vitest";
import { sharedExtensions } from "../src/vendor/open-knowledge/app/src/editor/extensions/shared";
import { useBlockSelection } from "../src/vendor/open-knowledge/app/src/editor/hooks/use-block-selection";
import "./vendor-jsdom-setup";

vi.mock("@lingui/core/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));
vi.mock("@lingui/react/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));

test("B01 reports the selected JSX block and clears it when the editor selection leaves", () => {
  const editor = new Editor({
    extensions: sharedExtensions,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        { type: "jsxComponent", attrs: { componentName: "Callout" }, content: [{ type: "paragraph" }] },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    },
  });
  const view = renderHook(() => useBlockSelection(editor));
  try {
    const blockPosition = editor.state.doc.firstChild!.nodeSize;
    expect(view.result.current?.selectedBlockId).toBeNull();
    act(() => {
      editor.commands.setNodeSelection(blockPosition);
    });
    expect(view.result.current?.ancestorChain.at(-1)).toMatchObject({ componentName: "Callout", pos: blockPosition });
    expect(view.result.current?.selectedBlockId).toBe(view.result.current?.ancestorChain.at(-1)?.bridgeId);
    act(() => {
      editor.commands.setTextSelection(1);
    });
    expect(view.result.current?.selectedBlockId).toBeNull();
    expect(view.result.current?.ancestorChain).toEqual([]);
  } finally {
    view.unmount();
    editor.destroy();
  }
});
