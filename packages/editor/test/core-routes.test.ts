import { expect, test, vi } from "vitest";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { coreRoutes } from "../src/host/routes/core";
import { loadBacklinkCount, loadDocContent, resetInternalDocPreviewCache } from "../src/vendor/open-knowledge/app/src/editor/link-preview/internal-doc-preview";
import { parseApiError } from "../src/vendor/open-knowledge/app/src/lib/parse-api-error";

const source = { docName: "source", title: "Source", size: 1, modified: "2026-11-20", docExt: "md", tags: ["work"] };
const target = { ...source, docName: "target", title: "Target", tags: ["work/project"] };

const cases = [
  { path: "/api/pages", body: { pages: [source, target] } },
  { path: "/api/documents", body: { documents: [] } },
  {
    path: "/api/tags",
    body: {
      tags: [
        { name: "work", count: 2, isLeaf: false },
        { name: "work/project", count: 1, isLeaf: true },
      ],
    },
  },
  { path: "/api/tag-documents?tag=Work&docName=source", body: { docs: [{ docName: "target", title: "Target", matchingTags: ["work/project"] }] } },
  { path: "/api/page-headings?docName=source", body: { docName: "source", headings: [{ level: 1, text: "Outline", slug: "outline" }] } },
  { path: "/api/forward-links?docName=source", body: { docName: "source", forwardLinks: [{ kind: "doc", docName: "target", anchor: null, title: "Target", snippet: null }] } },
  { path: "/api/backlinks?docName=source", body: { docName: "source", backlinks: [{ source: "target", title: "Target", anchor: null, snippet: null }] } },
  { path: "/api/document?docName=target", body: { docName: "target", content: "# Target\n", lifecycle: null } },
  { path: "/api/backlink-counts?docNames=source", body: { counts: { source: 1 } } },
];

test.each(cases)("core host route $path returns its client shape and preserves the error message", async ({ path, body }) => {
  let fail = false;
  const value = <T>(data: T): T => {
    if (fail) throw new Error("笔记资料暂时无法读取");
    return data;
  };
  const dispose = registerHostRoutes(
    coreRoutes({
      listPages: () => value([source, target]),
      listDocuments: () => value([]),
      suggestions: {
        listTags: async () =>
          value([
            { tag: "work", count: 2 },
            { tag: "work/project", count: 1 },
          ]),
        readDocument: async (name) => value(name === "source" ? "# Outline\n\n```md\n# Hidden\n```\n\n[[target]]\n" : name === "target" ? "# Target\n" : null),
        listBacklinks: async (name) => value(name === "source" ? [{ source: "target", title: "Target" }] : []),
      },
    }),
  );
  try {
    const success = await hostFetch(path);
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual(body);

    fail = true;
    const failure = await hostFetch(path);
    expect(failure.status).toBe(500);
    const problem = await failure.json();
    expect(problem).toMatchObject({ code: "HOST_ERROR", status: 500 });
    expect(parseApiError(problem)).toBe("笔记资料暂时无法读取");
  } finally {
    dispose();
  }
});

test("a delayed preview response stays outside the next Vault's document and backlink caches", async () => {
  const previousContent = Promise.withResolvers<Response>();
  const previousCount = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(previousContent.promise)
      .mockReturnValueOnce(previousCount.promise)
      .mockResolvedValueOnce(Response.json({ docName: "shared", content: "new Vault", lifecycle: null }))
      .mockResolvedValueOnce(Response.json({ counts: { shared: 2 } })),
  );
  try {
    const oldContent = loadDocContent("shared");
    const oldCount = loadBacklinkCount("shared");
    resetInternalDocPreviewCache();

    expect(await loadDocContent("shared")).toBe("new Vault");
    expect(await loadBacklinkCount("shared")).toBe(2);
    previousContent.resolve(Response.json({ docName: "shared", content: "old Vault", lifecycle: null }));
    previousCount.resolve(Response.json({ counts: { shared: 5 } }));
    expect(await oldContent).toBeNull();
    expect(await oldCount).toBeNull();
    expect(await loadDocContent("shared")).toBe("new Vault");
    expect(await loadBacklinkCount("shared")).toBe(2);
  } finally {
    resetInternalDocPreviewCache();
    vi.unstubAllGlobals();
  }
});

test("host principal is a local constant and unsupported methods return a clear error", async () => {
  const off = registerHostRoutes(coreRoutes({ listPages: () => [], listDocuments: () => [] }));
  try {
    const principal = await hostFetch("/api/principal");
    expect(principal.status).toBe(200);
    expect(await principal.json()).toEqual({ principal: { id: "local", name: "Huhu", kind: "human" } });
    const write = await hostFetch("/api/principal", { method: "POST" });
    expect(write.status).toBe(404);
    expect(await write.json()).toMatchObject({ code: "NOT_AVAILABLE" });
  } finally {
    off();
  }
});
