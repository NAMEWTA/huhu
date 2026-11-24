// @vitest-environment jsdom

import type { SuggestionProps } from "@tiptap/suggestion";
import { afterEach, expect, test } from "vitest";
import { createSuggestionPopup } from "../src/vendor/open-knowledge/app/src/editor/extensions/suggestion-floating-ui.js";

afterEach(() => document.body.replaceChildren());

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
