// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { expect, test, vi } from "vitest";
import { DocumentProvider } from "../src/host/document-context";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { coreRoutes } from "../src/host/routes/core";
import { TagDialog } from "../src/vendor/open-knowledge/app/src/editor/components/TagDialog";
import { dispatchTagClickEvent } from "../src/vendor/open-knowledge/app/src/editor/extensions/tag-click-plugin";

vi.mock("@lingui/core/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));
vi.mock("@lingui/react/macro", () => import("../src/vendor/open-knowledge/app/tests/lingui-macro-shim"));

function Fixture() {
  const scope = useRef<HTMLDivElement>(null);
  return (
    <DocumentProvider>
      <div ref={scope}>
        <button onClick={(event) => dispatchTagClickEvent("work", event.currentTarget)}>#work</button>
        <TagDialog scope={scope} docName="source" />
      </div>
    </DocumentProvider>
  );
}

test.each([
  { failed: false, testId: "tag-dialog-list", text: "Matching note" },
  { failed: true, testId: "tag-dialog-error", text: "暂时无法列出标签文档" },
])("tag dialog renders the host route's $testId response", async ({ failed, testId, text }) => {
  const dispose = registerHostRoutes(
    coreRoutes({
      listPages: () => {
        if (failed) throw new Error("暂时无法列出标签文档");
        return [{ docName: "other", title: "Matching note", tags: ["work/project"], size: 1, modified: "2026-11-20", docExt: "md" }];
      },
      listDocuments: () => [],
      suggestions: {
        listTags: async () => [],
        readDocument: async () => null,
        listBacklinks: async () => [],
      },
    }),
  );
  vi.stubGlobal("fetch", hostFetch);
  try {
    render(<Fixture />);
    fireEvent.click(screen.getByRole("button", { name: "#work" }));
    const result = await screen.findByTestId(testId);
    expect(result.textContent).toContain(text);
    expect(screen.getByRole("dialog").contains(result)).toBe(true);
  } finally {
    cleanup();
    vi.unstubAllGlobals();
    dispose();
  }
});
