import { describe, expect, test } from "vitest";
import { UploadAssetSuccessSchema } from "../src/vendor/open-knowledge/core/src/schemas/api/index.ts";
import { hostFetch, registerHostRoutes } from "../src/host/host-fetch";
import { filesRoutes, type FilesRouteDeps } from "../src/host/routes/files";
import { uploadResponse, uploadRoutes, type UploadRequest } from "../src/host/routes/upload";

const form = (fields: Record<string, string>, file = new File([new Uint8Array([1, 2, 3])], "图.png", { type: "image/png" })) => {
  const f = new FormData();
  f.append("file", file);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

describe("uploadResponse：上游 UploadAssetSuccess 形状", () => {
  test("src 相对笔记所在目录，path 是 Vault 相对路径", () => {
    expect(uploadResponse("docs/attachments/a.png", "docs/说明.md", false)).toEqual({ src: "attachments/a.png", path: "docs/attachments/a.png" });
    expect(uploadResponse("attachments/a.png", "n.md", true)).toEqual({ src: "attachments/a.png", path: "attachments/a.png", deduped: true });
    expect(uploadResponse("资料/a.pdf", undefined, false)).toEqual({ src: "资料/a.pdf", path: "资料/a.pdf" });
    expect(UploadAssetSuccessSchema.safeParse(uploadResponse("docs/attachments/a.png", "docs/说明.md", true)).success).toBe(true);
  });
});

describe("POST /api/upload（hostFetch）", () => {
  test("编辑器上传：parentDocName 变成 notePath 交给宿主", async () => {
    const seen: UploadRequest[] = [];
    const off = registerHostRoutes(uploadRoutes(async (r) => (seen.push(r), { path: "docs/attachments/图.png" })));
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: form({ parentDocName: "docs/说明.md" }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ src: "attachments/图.png", path: "docs/attachments/图.png" });
      expect(seen[0]?.notePath).toBe("docs/说明.md");
      expect(seen[0]?.name).toBe("图.png");
    } finally {
      off();
    }
  });
  test("宿主拒绝（类型 / 大小）→ 500 ProblemDetails，title 是可读原因", async () => {
    const off = registerHostRoutes(
      uploadRoutes(async () => {
        throw new Error("不支持的附件类型：a.exe");
      }),
    );
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: form({ parentDocName: "n.md" }) });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { title: string }).title).toBe("不支持的附件类型：a.exe");
    } finally {
      off();
    }
  });
  test("缺少 file 或宿主没提供上传能力 → 明确错误", async () => {
    const off = registerHostRoutes(uploadRoutes(async () => ({ path: "x" })));
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: new FormData() });
      expect(res.status).toBe(500);
      expect(((await res.json()) as { title: string }).title).toBe("缺少 file");
    } finally {
      off();
    }
    const deps = { upload: undefined } as unknown as FilesRouteDeps;
    const off2 = registerHostRoutes(filesRoutes(deps));
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: form({ dir: "资料" }) });
      expect(((await res.json()) as { title: string }).title).toBe("宿主未提供上传能力");
    } finally {
      off2();
    }
  });
  test("文件树拖入（上游 placement=parent-dir）：parentDocName 的目录部分就是目标目录", async () => {
    const seen: UploadRequest[] = [];
    const deps = { upload: async (r: UploadRequest) => (seen.push(r), { path: r.dir ? `${r.dir}/${r.name}` : r.name }) } as unknown as FilesRouteDeps;
    const off = registerHostRoutes(filesRoutes(deps));
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: form({ parentDocName: "资料/子/报告.pdf", placement: "parent-dir" }, new File([new Uint8Array([9])], "报告.pdf")) });
      expect(await res.json()).toEqual({ src: "资料/子/报告.pdf", path: "资料/子/报告.pdf" });
      expect(seen[0]).toMatchObject({ dir: "资料/子", name: "报告.pdf" });
      expect(seen[0]?.notePath).toBeUndefined();
      // 拖到根目录：parentDocName 没有目录部分
      const root = await hostFetch("/api/upload", { method: "POST", body: form({ parentDocName: "报告.pdf", placement: "parent-dir" }, new File([new Uint8Array([9])], "报告.pdf")) });
      expect(seen[1]).toMatchObject({ dir: "", name: "报告.pdf" });
      expect(((await root.json()) as { path: string }).path).toBe("报告.pdf");
    } finally {
      off();
    }
  });
  test("文件树上传：dir 原样交给宿主，响应 src = path", async () => {
    const seen: UploadRequest[] = [];
    const deps = { upload: async (r: UploadRequest) => (seen.push(r), { path: `${r.dir}/${r.name}`, deduped: true }) } as unknown as FilesRouteDeps;
    const off = registerHostRoutes(filesRoutes(deps));
    try {
      const res = await hostFetch("/api/upload", { method: "POST", body: form({ dir: "资料" }, new File([new Uint8Array([9])], "报告.pdf")) });
      expect(await res.json()).toEqual({ src: "资料/报告.pdf", path: "资料/报告.pdf", deduped: true });
      expect(seen[0]).toMatchObject({ dir: "资料", name: "报告.pdf" });
      expect(seen[0]?.notePath).toBeUndefined();
    } finally {
      off();
    }
  });
});
