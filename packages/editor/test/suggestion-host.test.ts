// @vitest-environment jsdom

import type { SuggestionProps } from "@tiptap/suggestion";
import { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, expect, test } from "vitest";
import { KeyboardNav } from "../src/vendor/open-knowledge/app/src/editor/block-ux/keyboard-nav.js";
import { createSuggestionPopup } from "../src/vendor/open-knowledge/app/src/editor/extensions/suggestion-floating-ui.js";

afterEach(() => document.body.replaceChildren());

test("editor Escape uses the nearest dialog's cancel policy before changing block selection", () => {
  const outer = document.body.appendChild(document.createElement("dialog"));
  outer.open = true;
  const dialog = outer.appendChild(document.createElement("dialog"));
  dialog.open = true;
  const events: EventTarget[] = [];
  for (const element of [outer, dialog]) {
    element.addEventListener("cancel", (event) => {
      event.preventDefault();
      events.push(element);
    });
  }
  const editor = new Editor({
    element: dialog.appendChild(document.createElement("div")),
    content: "<h2>Heading</h2>",
    extensions: [StarterKit, KeyboardNav],
  });
  try {
    editor.commands.setTextSelection(2);
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
    expect(events).toEqual([dialog]);
    expect(dialog.open).toBe(true);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
  } finally {
    editor.destroy();
  }
});

test("Tiptap suggestion popups stay inside the invoker's nearest open dialog", () => {
  const workbench = document.body.appendChild(document.createElement("main"));
  workbench.className = "hu-app";
  const outer = workbench.appendChild(document.createElement("dialog"));
  outer.open = true;
  const inner = outer.appendChild(document.createElement("dialog"));
  inner.open = true;
  const dom: HTMLElement = inner.appendChild(document.createElement("div"));
  const props = () => ({ editor: { view: { dom } } }) as SuggestionProps<unknown>;
  const { popup } = createSuggestionPopup(props, "slash-command", { clipToEditorPane: true });
  expect(popup.parentElement).toBe(inner);
  expect(popup.classList.contains("editor-ok-portal")).toBe(true);
  expect(popup.style.visibility).toBe("hidden");

  inner.open = false;
  expect(createSuggestionPopup(props, "tag-suggestion").popup.parentElement).toBe(outer);
  outer.open = false;
  expect(createSuggestionPopup(props, "wiki-link-suggestion").popup.parentElement).toBe(workbench);
});
