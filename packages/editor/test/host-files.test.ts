import { describe, expect, test } from "vitest";
import { DocumentListSuccessSchema } from "../src/vendor/open-knowledge/core/src/schemas/api/document-read.ts";
import { CreateFolderSuccessSchema, CreatePageSuccessSchema, DeletePathSuccessSchema, DuplicatePathSuccessSchema, RenamePathSuccessSchema } from "../src/vendor/open-knowledge/core/src/schemas/api/pages.ts";
import { WorkspaceSuccessSchema } from "../src/vendor/open-knowledge/core/src/schemas/api/history.ts";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { filesRoutes, isHidden, type FilesRouteDeps, type HostFsEntry } from "../src/host/routes/files";

const e = (path: string, kind: HostFsEntry["kind"], extra: Partial<HostFsEntry> = {}): HostFsEntry => ({ name: path.split("/").at(-1)!, path, kind, size: 3, mtimeMs: 1_700_000_000_000, ...extra });
const tree: Record<string, HostFsEntry[]> = {
  "": [e("Notes", "dir"), e("Empty", "dir"), e("readme.md", "file"), e("data.json", "file"), e("paper.PDF", "file"), e(".huhu", "dir", { protected: "internal" })],
  Notes: [e("Notes/a.md", "file"), e("Notes/img.png", "file")],
};
let hidden: string[] = [];
let showHidden = false;
const deps: FilesRouteDeps = {
  list: async (dir) => ({ entries: tree[dir] ?? [] }),
  hiddenPaths: () => hidden,
  showHidden: () => showHidden,
  rename: async (i) => ({ moved: { [i.fromPath]: i.toPath } }),
  duplicate: async (i) => ({ path: `${i.path} 副本`, paths: [`${i.path} 副本.md`] }),
  trash: async (i) => ({ paths: [i.path] }),
  createPage: async (i) => ({ path: i.path }),
  createFolder: async (i) => ({ path: i.path }),
  workspace: () => ({ root: "/vault", separator: "/" }),
};
registerHostRoutes(filesRoutes(deps));
const get = async (url: string) => (await hostFetch(url)).json();
const post = async (url: string, body: unknown) => (await hostFetch(url, { method: "POST", body: JSON.stringify(body) })).json();

describe("S5 files 路由（A01 / A05 / A10：全部真实文件、空目录、受保护元信息）", () => {
  test("列举整层：文件夹 / md / 非 md 都出现，响应通过上游 schema", async () => {
    const body = await get("/api/documents?showAll=true&dir=&depth=1");
    const parsed = DocumentListSuccessSchema.parse(body);
    expect(parsed.documents.map((d) => d.kind)).toEqual(["folder", "folder", "document", "file", "file", "folder"]);
    const paths = parsed.documents.map((d) => d.path ?? d.docName);
    expect(paths).toContain("Empty");
    expect(paths).toContain(".huhu");
    expect(paths).toContain("paper.PDF");
  });
  test("Markdown 条目 docName 去掉扩展名，非 Markdown 条目保留路径", async () => {
    const body = DocumentListSuccessSchema.parse(await get("/api/documents?showAll=true&dir=Notes&depth=1"));
    expect(body.documents[0]).toMatchObject({ kind: "document", docName: "Notes/a" });
    expect(body.documents[1]).toMatchObject({ kind: "file", path: "Notes/img.png", assetExt: ".png" });
  });
});

describe("A02 / A03：隐藏只作用于树视图", () => {
  test("隐藏目录后树里不可见（含子树），规则默认空", async () => {
    expect(hidden).toEqual([]);
    hidden = ["Notes"];
    const root = DocumentListSuccessSchema.parse(await get("/api/documents?showAll=true&dir="));
    expect(root.documents.map((d) => d.path)).not.toContain("Notes");
    const sub = DocumentListSuccessSchema.parse(await get("/api/documents?showAll=true&dir=Notes"));
    expect(sub.documents).toEqual([]);
  });
  test("“显示已隐藏项目”恢复可见；非 showAll 的页面清单不受隐藏影响", async () => {
    showHidden = true;
    expect(DocumentListSuccessSchema.parse(await get("/api/documents?showAll=true&dir=")).documents.map((d) => d.path)).toContain("Notes");
    showHidden = false;
    const none = DocumentListSuccessSchema.parse(await get("/api/documents"));
    expect(none.documents).toEqual([]);
    deps.listDocumentPaths = async () => [e("Notes/a.md", "file"), e("x.png", "file")];
    expect(DocumentListSuccessSchema.parse(await get("/api/documents")).documents.map((d) => d.docName)).toEqual(["Notes/a"]);
    hidden = [];
  });
  test("isHidden 命中规则本身与后代，不误伤同前缀兄弟", () => {
    expect(isHidden("a/b", ["a"])).toBe(true);
    expect(isHidden("a", ["a"])).toBe(true);
    expect(isHidden("ab/c", ["a"])).toBe(false);
  });
});

describe("A07：写操作走同一业务能力", () => {
  test("重命名（md / 非 md）按上游响应形状返回", async () => {
    const r = RenamePathSuccessSchema.parse(await post("/api/rename-path", { kind: "file", fromPath: "a.md", toPath: "b.md" }));
    expect(r.renamed).toEqual([{ fromDocName: "a", toDocName: "b" }]);
    const f = RenamePathSuccessSchema.parse(await post("/api/rename-path", { kind: "asset", fromPath: "x.png", toPath: "y.png" }));
    expect(f.renamedAssets).toEqual([{ fromPath: "x.png", toPath: "y.png" }]);
  });
  test("复制 / 删除（回收站）/ 创建页面与文件夹 / workspace", async () => {
    expect(DuplicatePathSuccessSchema.parse(await post("/api/duplicate-path", { kind: "file", path: "a" })).duplicatedDocNames).toEqual(["a 副本"]);
    expect(DeletePathSuccessSchema.parse(await post("/api/delete-path", { kind: "file", path: "a.md" })).deletedDocNames).toEqual(["a"]);
    expect(CreatePageSuccessSchema.parse(await post("/api/create-page", { path: "n/new.md" })).docName).toBe("n/new");
    expect(CreateFolderSuccessSchema.parse(await post("/api/create-folder", { path: "n/dir" })).path).toBe("n/dir");
    expect(WorkspaceSuccessSchema.parse(await get("/api/workspace")).pathSeparator).toBe("/");
  });
  test("缺少必填字段 → 500 HOST_ERROR，不静默成功", async () => {
    const res = await hostFetch("/api/rename-path", { method: "POST", body: JSON.stringify({ kind: "file" }) });
    expect(res.status).toBe(500);
  });
});
