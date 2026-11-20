// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Editor, EditorContent } from "@tiptap/react";
import { useRef, useState } from "react";
import { Toaster } from "sonner";
import { expect, test, vi } from "vitest";
import { HostConfigProvider, registerLinkPreviewRoute } from "../src/host/config-provider";
import { installDesktopBridge } from "../src/host/desktop-bridge";
import { DEFAULT_FEATURES } from "../src/host/ok-host";
import { DocumentProvider } from "../src/host/document-context";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { filesRoutes } from "../src/host/routes/files";
import { coreRoutes } from "../src/host/routes/core";
import { commentRoutes, type HuhuComment } from "../src/host/routes/comments";
import { CommentsBoundary } from "../src/vendor/open-knowledge/app/src/comments/CommentsBoundary";
import { CommentedDocProvider, useCommentedDocName } from "../src/vendor/open-knowledge/app/src/comments/CommentedDocContext";
import { CommentsPanel } from "../src/vendor/open-knowledge/app/src/comments/CommentsPanel";
import { createFileThread, deleteThread, reopenThread, replaceOrphan, replyToThread, resolveThread } from "../src/vendor/open-knowledge/app/src/comments/store";
import { TagDialog } from "../src/vendor/open-knowledge/app/src/editor/components/TagDialog";
import { dispatchTagClickEvent } from "../src/vendor/open-knowledge/app/src/editor/extensions/tag-click-plugin";
import { setEditorDocName } from "../src/vendor/open-knowledge/app/src/editor/extensions/doc-context";
import { scopeExtensionsToDocument, sharedExtensions } from "../src/vendor/open-knowledge/app/src/editor/extensions/shared";
import { attachOkFetch } from "../src/vendor/open-knowledge/app/src/lib/ok-fetch";
import { NewItemDialog } from "../src/vendor/open-knowledge/app/src/components/NewItemDialog";
import { PageListProvider } from "../src/vendor/open-knowledge/app/src/components/PageListContext";
import { InternalLinkPropPanel } from "../src/vendor/open-knowledge/app/src/editor/extensions/InternalLinkPropPanel";
import { findMarkIdAt } from "../src/vendor/open-knowledge/app/src/editor/extensions/mark-identity";
import { TooltipProvider } from "../src/vendor/open-knowledge/app/src/components/ui/tooltip";
import "./vendor-jsdom-setup";

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

const pages = [
  { docName: "alpha", title: "Alpha note", size: 1, modified: "2026-11-20", docExt: ".md" },
  { docName: "target", title: "Target note", size: 1, modified: "2026-11-20", docExt: ".md" },
];

test.each([
  { path: "/api/tags", trigger: "#", ok: ["project"], error: "Failed to load tags" },
  { path: "/api/pages", trigger: "[[", ok: ["Target note", "Alpha note"], error: "Failed to load pages" },
  { path: "/api/page-headings", trigger: "[[target#", ok: ["Target heading"], error: "Failed to load headings for target" },
  { path: "/api/forward-links", trigger: "[[", ok: ["Target note", "Alpha note"], fallback: ["Alpha note", "Target note"] },
  { path: "/api/backlinks", trigger: "[[", ok: ["Target note", "Alpha note"], fallback: ["Alpha note", "Target note"] },
])("H04 $path drives the editor suggestion UI in both route outcomes", async ({ path, trigger, ok, error, fallback }) => {
  for (const failed of [false, true]) {
    const guard = <T,>(route: string, value: T): T => {
      if (failed && route === path) throw new Error("测试读取失败");
      return value;
    };
    const routes = coreRoutes({
      listPages: () => guard("/api/pages", pages),
      listDocuments: () => [],
      suggestions: {
        listTags: async () => guard("/api/tags", [{ tag: "project", count: 1 }]),
        readDocument: async (docName) => (docName === "source" ? guard("/api/forward-links", path === "/api/backlinks" ? "" : "[[target]]") : guard("/api/page-headings", "# Target heading")),
        listBacklinks: async () => guard("/api/backlinks", path === "/api/backlinks" ? [{ source: "target", title: "Target note" }] : []),
      },
    });
    const statuses: Response[] = [];
    const removeRoutes = registerHostRoutes(routes);
    const stopFetch = attachOkFetch(async (input, init) => {
      const response = await hostFetch(input, init);
      if (String(input).split("?")[0] === path) statuses.push(response.clone());
      return response;
    });
    const editor = new Editor({ extensions: scopeExtensionsToDocument(sharedExtensions, "source"), content: "<p></p>" });
    setEditorDocName(editor, "source");
    const view = render(<EditorContent editor={editor} />);
    try {
      await act(async () => {
        editor.view.focus();
        editor.view.dispatch(editor.state.tr.insertText(trigger, 1));
      });
      if (failed && error) {
        const feedback = await screen.findByText((text) => text.startsWith(error));
        expect(feedback.getAttribute("role")).toBe("status");
        expect(feedback.getAttribute("aria-live")).toBe("polite");
      } else {
        const list = await screen.findByRole("listbox");
        for (const [index, text] of (failed ? fallback! : ok).entries()) {
          expect(within(list).getAllByRole("option")[index]?.textContent).toContain(text);
        }
      }
      expect(statuses).toHaveLength(1);
      const response = statuses[0]!;
      expect(response.status).toBe(failed ? 500 : 200);
      if (failed) expect(await response.json()).toMatchObject({ code: "HOST_ERROR" });
    } finally {
      await act(async () => editor.destroy());
      view.unmount();
      stopFetch();
      removeRoutes();
    }
  }
});

test.each([
  { method: "POST", path: "/api/comments", name: "create", run: (id: string) => createFileThread({ docName: id, body: "新批注" }), toast: "Couldn't add that comment" },
  { method: "POST", path: "/api/comment", name: "reply", run: (id: string) => replyToThread(id, "新回复"), toast: "Couldn't send that reply" },
  { method: "DELETE", path: "/api/comment", name: "delete", run: deleteThread, toast: "Couldn't delete that comment" },
  { method: "POST", path: "/api/comment", name: "resolve", run: resolveThread, toast: "Couldn't resolve that comment" },
  { method: "POST", path: "/api/comment", name: "reopen", run: reopenThread, toast: "Couldn't reopen that comment" },
  { method: "POST", path: "/api/comment", name: "relocate", run: (id: string) => replaceOrphan(id, "新引用"), toast: "Couldn't re-place that comment" },
])("H04 comment $name renders the successful update or the rejected request toast", async ({ method, path, name, run, toast }) => {
  const failure = "批注写入暂时不可用";
  for (const failed of [true, false]) {
    const id = `comment-${name}-${failed}`;
    const at = "2026-11-20T12:00:00.000Z";
    const base: HuhuComment = {
      id,
      documentPath: `${id}.md`,
      target: name === "relocate" ? "body" : "file",
      property: null,
      state: name === "relocate" ? "orphaned" : "anchored",
      anchor: null,
      resolved: name === "reopen",
      createdAt: at,
      updatedAt: at,
      messages: [{ at, author: "Huhu", text: "已有批注" }],
    };
    let entries: HuhuComment[] = name === "create" ? [] : [base];
    const change = (next: HuhuComment[]): void => {
      if (failed) throw new Error(failure);
      entries = next;
    };
    const remove = registerHostRoutes(
      commentRoutes({
        port: {
          list: async () => entries,
          create: async ({ text }) => {
            const created = { ...base, messages: [{ at, author: "Huhu", text }] };
            change([created]);
            return created;
          },
          reply: async (_id, text) => {
            const updated = { ...base, messages: [...base.messages, { at, author: "Huhu", text }] };
            change([updated]);
            return updated;
          },
          delete: async () => change([]),
          resolve: async () => {
            const updated = { ...base, resolved: true };
            change([updated]);
            return updated;
          },
          reopen: async () => {
            const updated = { ...base, resolved: false };
            change([updated]);
            return updated;
          },
          relocate: async (_id, { quote }) => {
            const updated: HuhuComment = { ...base, state: "anchored", anchor: { exact: quote!, prefix: "", suffix: "", start: 0, end: quote!.length } };
            change([updated]);
            return updated;
          },
        },
        pathOf: (docName) => `${docName}.md`,
        docNameOf: (documentPath) => documentPath.replace(/\.md$/, ""),
        flush: async () => {},
      }),
    );
    const responses: Response[] = [];
    const stop = attachOkFetch(async (input, init) => {
      const response = await hostFetch(input, init);
      if (init?.method === method && String(input).split("?")[0] === path) responses.push(response.clone());
      return response;
    });
    const view = render(
      <>
        <TooltipProvider>
          <CommentsPanel docName={id} />
        </TooltipProvider>
        <Toaster />
      </>,
    );
    try {
      if (name === "reopen") fireEvent.click(await screen.findByRole("button", { name: /show resolved/i }));
      if (name !== "create") await screen.findByText("已有批注");
      await act(async () => run(id));
      if (failed) {
        const notification = await screen.findByText((text) => text.startsWith(toast) && text.includes(failure));
        expect(notification.closest("[data-sonner-toast]")).not.toBeNull();
      } else if (name === "delete") {
        await screen.findByText(/No comments yet/);
        expect(screen.queryByText("已有批注")).toBeNull();
      } else if (name === "resolve") {
        fireEvent.click(await screen.findByRole("button", { name: /show resolved/i }));
        expect((await screen.findByTestId("comment-thread")).getAttribute("data-state")).toBe("resolved");
      } else if (name === "reopen") {
        await waitFor(() => expect(screen.getByTestId("comment-thread").getAttribute("data-state")).toBe("anchored"));
      } else if (name === "relocate") {
        await screen.findByText((text) => text.includes("新引用"));
        expect(screen.getByTestId("comment-thread").getAttribute("data-state")).toBe("anchored");
      } else if (name === "create") {
        await screen.findByText("新批注");
      } else {
        expect((await screen.findByTestId("thread-reply")).textContent).toContain("新回复");
      }
      expect(responses.map(({ status }) => status)).toEqual([failed ? 500 : 200]);
      if (failed) expect(await responses[0]!.json()).toMatchObject({ code: "HOST_ERROR" });
    } finally {
      view.unmount();
      stop();
      remove();
    }
  }
});

function mountLinkPanel(url: string, linkPreviewsEnabled: boolean) {
  const editor = new Editor({
    extensions: scopeExtensionsToDocument(sharedExtensions, "source"),
    content: `<p><a href="${url}">Example URL</a></p>`,
  });
  const nodeId = findMarkIdAt(editor.state, 1, "link");
  expect(nodeId).not.toBeNull();
  const view = render(
    <HostConfigProvider config={{ linkPreviewsEnabled }}>
      <TooltipProvider>
        <PageListProvider>
          <InternalLinkPropPanel editor={editor} nodeId={nodeId!} sourceDocName="source" onClose={() => {}} onNavigate={() => true} />
        </PageListProvider>
      </TooltipProvider>
    </HostConfigProvider>,
  );
  return () => {
    view.unmount();
    editor.destroy();
  };
}

test.each([
  { state: "available", enabled: true, status: 200 },
  { state: "host failure", enabled: true, status: 500 },
  { state: "disabled", enabled: false, status: null },
])("H04 external link preview $state preserves the URL", async ({ state, enabled, status }) => {
  const url = `https://example.invalid/${encodeURIComponent(state)}`;
  const stopRoute = registerLinkPreviewRoute(async (requestedUrl) => {
    expect(requestedUrl).toBe(url);
    if (status === 500) throw new Error("预览暂时不可用");
    return { ok: true, metadata: { domain: "example.invalid", title: "Preview title" } };
  });
  const stopPages = registerHostRoutes(coreRoutes({ listPages: () => [], listDocuments: () => [] }));
  const responses: Response[] = [];
  const stop = attachOkFetch(async (input, init) => {
    const response = await hostFetch(input, init);
    if (String(input) === "/api/link-preview") responses.push(response.clone());
    return response;
  });
  const unmount = mountLinkPanel(url, enabled);
  try {
    const link = await screen.findByRole("link", { name: url });
    expect(link.getAttribute("href")).toBe(url);
    if (status !== null) {
      await waitFor(() => expect(responses.map((response) => response.status)).toEqual([status]));
      if (status === 500) expect(await responses[0]!.json()).toMatchObject({ code: "HOST_ERROR" });
    } else {
      expect(responses).toHaveLength(0);
    }
    if (status === 200) await screen.findByText("Preview title");
    else expect(screen.queryByText("Preview title")).toBeNull();
  } finally {
    unmount();
    stop();
    stopPages();
    stopRoute();
  }
});

test.each([{ errorPath: null }, { errorPath: "/api/document" }, { errorPath: "/api/backlink-counts" }])("H04 internal preview renders metadata and handles failure at $errorPath", async ({ errorPath }) => {
  const docName = errorPath?.split("/").at(-1) ?? "success";
  const stopRoutes = registerHostRoutes(
    coreRoutes({
      listPages: () => [{ ...pages[0]!, docName, title: "Previewed document" }],
      listDocuments: () => [],
      suggestions: {
        listTags: async () => [],
        readDocument: async () => {
          if (errorPath === "/api/document") throw new Error("无法读取文档");
          return "Readable preview excerpt.";
        },
        listBacklinks: async () => {
          if (errorPath === "/api/backlink-counts") throw new Error("无法计算反向链接");
          return [{ source: "source", title: "Source note" }];
        },
      },
    }),
  );
  const responses = new Map<string, Response>();
  const stop = attachOkFetch(async (input, init) => {
    const response = await hostFetch(input, init);
    const pathname = String(input).split("?")[0]!;
    responses.set(pathname, response.clone());
    return response;
  });
  const unmount = mountLinkPanel(`${docName}.md`, false);
  try {
    await screen.findByText("Previewed document");
    await waitFor(() => {
      expect(responses.get("/api/document")?.status).toBe(errorPath === "/api/document" ? 500 : 200);
      expect(responses.get("/api/backlink-counts")?.status).toBe(errorPath === "/api/backlink-counts" ? 500 : 200);
    });
    if (errorPath) expect(await responses.get(errorPath)!.json()).toMatchObject({ code: "HOST_ERROR" });
    if (errorPath === "/api/document") expect(screen.queryByText("Readable preview excerpt.")).toBeNull();
    else await screen.findByText("Readable preview excerpt.");
    if (errorPath === "/api/backlink-counts") expect(screen.queryByText("1 backlink")).toBeNull();
    else await screen.findByText("1 backlink");
  } finally {
    unmount();
    stop();
    stopRoutes();
  }
});

test.each([{ errorPath: null }, { errorPath: "/api/folder-config" }, { errorPath: "/api/create-page" }])("H04 new-note dialog handles $errorPath and keeps valid input", async ({ errorPath }) => {
  const stopRoutes = registerHostRoutes(
    filesRoutes({
      list: async () => ({ entries: [] }),
      listTemplates: async () => {
        if (errorPath === "/api/folder-config") throw new Error("无法读取模板目录");
        return ["模板/周报.md"];
      },
      createPage: async ({ path }) => {
        if (errorPath === "/api/create-page") throw new Error("此目录已有同名笔记");
        return { path };
      },
      hiddenPaths: () => [],
      showHidden: () => true,
      rename: async () => ({ moved: {} }),
      duplicate: async () => ({ path: "", paths: [] }),
      trash: async () => ({ paths: [] }),
      createFolder: async ({ path }) => ({ path }),
      workspace: () => ({ root: "/vault", separator: "/" }),
    }),
  );
  const responses = new Map<string, Response>();
  const stop = attachOkFetch(async (input, init) => {
    const response = await hostFetch(input, init);
    responses.set(String(input).split("?")[0]!, response.clone());
    return response;
  });
  const created = vi.fn();
  function Dialog() {
    const [open, setOpen] = useState(true);
    return <NewItemDialog open={open} onOpenChange={setOpen} kind="file" initialDir="" onCreated={created} />;
  }
  try {
    render(
      <PageListProvider>
        <Dialog />
      </PageListProvider>,
    );
    if (errorPath === "/api/folder-config") {
      expect((await screen.findByRole("alert")).textContent).toContain("无法读取模板目录");
    } else {
      await screen.findByText("Start from");
    }
    const name = screen.getByRole("textbox", { name: "File name" });
    fireEvent.change(name, { target: { value: "new-note" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    if (errorPath === "/api/create-page") {
      const error = await screen.findByRole("alert");
      expect(error.textContent).toContain("此目录已有同名笔记");
      expect(name.getAttribute("aria-invalid")).toBe("true");
      expect(name.getAttribute("aria-describedby")).toBe(error.id);
      expect((name as HTMLInputElement).value).toBe("new-note");
      expect(created).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(created).toHaveBeenCalledWith("new-note"));
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    expect(responses.get("/api/folder-config")?.status).toBe(errorPath === "/api/folder-config" ? 500 : 200);
    expect(responses.get("/api/create-page")?.status).toBe(errorPath === "/api/create-page" ? 500 : 200);
    if (errorPath) expect(await responses.get(errorPath)!.json()).toMatchObject({ code: "HOST_ERROR" });
  } finally {
    cleanup();
    stop();
    stopRoutes();
    window.location.hash = "";
  }
});

test("H04 comment list shows a load failure until a retry reads the list", async () => {
  let failed = true;
  const docName = "comment-list-retry";
  const dispose = registerHostRoutes({
    "GET /api/comments": () => {
      if (failed) throw new Error("测试读取失败");
      return { threads: [] };
    },
  });
  const stop = attachOkFetch(hostFetch);
  try {
    render(
      <TooltipProvider>
        <CommentsPanel docName={docName} />
      </TooltipProvider>,
    );
    const status = await screen.findByText("Couldn't load comments");
    expect(status.getAttribute("role")).toBe("status");
    expect(screen.queryByText(/No comments yet/)).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/No comments yet/);
    expect(screen.queryByText("Couldn't load comments")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  } finally {
    cleanup();
    stop();
    dispose();
  }
});

test.each([
  ["Win32", "win32"],
  ["MacIntel", "darwin"],
  ["Linux x86_64", "linux"],
])("H04 desktop bridge uses %s platform and only exposes wired members", async (navigationPlatform, platform) => {
  const navigation = vi.spyOn(navigator, "platform", "get").mockReturnValue(navigationPlatform);
  const openExternal = vi.fn(async () => {});
  const dispose = installDesktopBridge({ features: DEFAULT_FEATURES, openExternal });
  try {
    const bridge = window.okDesktop;
    expect(bridge?.platform).toBe(platform);
    expect(bridge?.config).toEqual({ projectPath: "", singleFile: false });
    expect(bridge?.clipboard).toBeUndefined();
    expect(bridge?.cliCommandName).toBeNull();
    expect(bridge?.mcpServerName).toBeNull();
    await bridge?.shell.openExternal("https://example.test/");
    expect(openExternal).toHaveBeenCalledWith("https://example.test/");
  } finally {
    dispose();
    navigation.mockRestore();
  }
  expect(window.okDesktop).toBeUndefined();
});

test.each(["missing", "rejected"] as const)("H04 image clipboard fallback reports a %s Clipboard API", async (failure) => {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const write = vi.fn(async () => {
    throw new DOMException("Clipboard denied", "NotAllowedError");
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: failure === "missing" ? undefined : { write } });
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor(readonly items: Record<string, Blob>) {}
    },
  );
  const fetchImage = vi.fn(async () => new Response(new Blob(["fixture"], { type: "image/png" })));
  const stopFetch = attachOkFetch(fetchImage);
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    render(
      <>
        <div className="ProseMirror">
          <img src="/fixtures/image.png" alt="Example" />
        </div>
        <Toaster />
      </>,
    );
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    screen.getByRole("img", { name: "Example" }).dispatchEvent(copy);
    expect(copy.defaultPrevented).toBe(true);
    const message = await screen.findByText("Couldn't copy image");
    expect(message.closest("[data-sonner-toast]")).not.toBeNull();
    expect(warning).toHaveBeenCalledWith(
      "[copy-image] browser clipboard write failed",
      failure === "missing" ? "clipboard-unavailable" : "write-error",
      failure === "missing" ? "navigator.clipboard.write unavailable" : expect.stringContaining("Clipboard denied"),
    );
    expect(fetchImage).toHaveBeenCalledTimes(failure === "missing" ? 0 : 1);
    expect(write).toHaveBeenCalledTimes(failure === "missing" ? 0 : 1);
  } finally {
    cleanup();
    stopFetch();
    warning.mockRestore();
    vi.unstubAllGlobals();
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

test("B01 批注上下文取当前文档，边界隔离批注渲染故障并保留正文", () => {
  function Comment({ fail }: { fail: boolean }) {
    const docName = useCommentedDocName();
    if (fail) throw new Error("批注渲染故障");
    return <p>批注属于 {docName}</p>;
  }

  function Note({ docName, fail = false }: { docName: string; fail?: boolean }) {
    return (
      <>
        <p>可编辑正文</p>
        <CommentsBoundary>
          <CommentedDocProvider docName={docName}>
            <Comment fail={fail} />
          </CommentedDocProvider>
        </CommentsBoundary>
      </>
    );
  }

  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const view = render(<Note docName="甲" />);
  try {
    expect(screen.getByText("批注属于 甲")).toBeDefined();
    view.rerender(<Note docName="乙" />);
    expect(screen.queryByText("批注属于 甲")).toBeNull();
    expect(screen.getByText("批注属于 乙")).toBeDefined();
    view.rerender(<Note docName="乙" fail />);
    expect(screen.queryByText("批注属于 乙")).toBeNull();
    expect(screen.getByText("可编辑正文")).toBeDefined();
  } finally {
    report.mockRestore();
    view.unmount();
  }
});
