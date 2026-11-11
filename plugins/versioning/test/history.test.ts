import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { FileHistory } from "../src/engine/history.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-h-"));
  dirs.push(root);
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  let t = 0;
  const files = new VaultFiles(root);
  return { root, files, h: new FileHistory(files, () => new Date(Date.UTC(2026, 10, 10, 0, 0, ++t))) };
}
const put = (root: string, rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

describe("文件历史", () => {
  test("记录版本；内容未变不产生新版本；时间线最新在前；读取历史内容", async () => {
    const { root, h } = setup();
    put(root, "n.md", "v1");
    const e1 = await h.record("n.md", "edit");
    expect(await h.record("n.md", "edit")).toBeNull();
    put(root, "n.md", "v2");
    await h.record("n.md", "edit");
    put(root, "n.md", "v3");
    await h.record("n.md", "edit");
    const tl = await h.timeline("n.md");
    expect(tl).toHaveLength(3);
    expect(await h.read(tl[0]!)).toBe("v3");
    expect(await h.read(tl[2]!)).toBe("v1");
    expect(e1?.id).toBe(tl[2]?.id);
  });
  test("命名版本：内容未变也保留；标题与来源出现在时间线", async () => {
    const { root, h } = setup();
    put(root, "n.md", "v1");
    await h.record("n.md", "edit");
    await h.record("n.md", "checkpoint", "定稿前");
    const tl = await h.timeline("n.md");
    expect(tl.map((e) => [e.source, e.title])).toEqual([
      ["checkpoint", "定稿前"],
      ["edit", null],
    ]);
  });
  test("ACC-VS-01 修改 3 次后改名：新路径的历史包含改名前的全部版本", async () => {
    const { root, h } = setup();
    for (const v of ["第一版内容很长很长很长", "第一版内容很长很长很长\n第二版新增", "第一版内容很长很长很长\n第二版新增\n第三版新增"]) {
      put(root, "N.md", v);
      await h.record("N.md", "edit");
    }
    renameSync(path.join(root, "N.md"), path.join(root, "M.md"));
    await h.recordMove("N.md", "M.md");
    const tl = await h.timeline("M.md");
    expect(tl.length).toBeGreaterThanOrEqual(4);
    expect(tl.map((e) => e.path)).toContain("N.md");
    expect(await h.read(tl[tl.length - 1]!)).toBe("第一版内容很长很长很长");
  });
  test("ACC-VS-02 恢复：先留下「恢复前」版本，内容等于所选旧版本；当前版本过期被拒", async () => {
    const { root, files, h } = setup();
    put(root, "n.md", "old");
    await h.record("n.md", "edit");
    put(root, "n.md", "new");
    await h.record("n.md", "edit");
    put(root, "n.md", "未保存的修改"); // 当前内容含未记录的修改
    const target = (await h.timeline("n.md")).find((e) => e.source === "edit" && true && true)!;
    const oldest = (await h.timeline("n.md")).at(-1)!;
    await expect(h.restore("n.md", oldest.id, "stale-version")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const cur = files.read("n.md")!.version;
    const r = await h.restore("n.md", oldest.id, cur);
    expect(r.checkpoint?.title).toBe("恢复前");
    expect(readFileSync(path.join(root, "n.md"), "utf8")).toBe("old");
    const tl = await h.timeline("n.md");
    const before = tl.find((e) => e.title === "恢复前")!;
    expect(await h.read(before)).toBe("未保存的修改"); // 未保存的修改没有丢
    expect(target).toBeDefined();
    expect(tl[0]?.source).toBe("restore");
  });
  test("只记录文本文件；≥10 MiB 与 .huhu/ 下的不记录；不创建也不影响用户自己的 .git", async () => {
    const { root, h } = setup();
    put(root, "img.png", "binary");
    put(root, ".huhu/x.json", "{}");
    put(root, "big.md", "x".repeat(10 * 1024 * 1024 + 1));
    expect(await h.record("img.png", "edit")).toBeNull();
    expect(await h.record(".huhu/x.json", "edit")).toBeNull();
    expect(await h.record("big.md", "edit")).toBeNull();
    expect(existsSync(path.join(root, ".git"))).toBe(false);
    execFileSync("git", ["init", "-q", root]);
    put(root, "n.md", "hi");
    await h.record("n.md", "edit");
    // 用户自己的仓库没有被写入任何提交（shadow 仓库独立）
    expect(() => execFileSync("git", ["-C", root, "log", "--oneline"], { stdio: "pipe" })).toThrow();
    expect(execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" })).toContain("n.md");
  });
  test("没有历史的文件时间线为空；越界路径被拒", async () => {
    const { h } = setup();
    expect(await h.timeline("nope.md")).toEqual([]);
    await expect(h.timeline("../x.md")).rejects.toMatchObject({ code: "PATH_OUTSIDE_VAULT" });
  });
});

describe("恢复保护（ACC-VS-04）", () => {
  test("规则文件恢复后一律暂停", async () => {
    const { guardRestoredContent } = await import("../src/engine/index.js");
    const rule = "---\nhuhu: {kind: automation-rule, id: rule-1, schema: 1}\nenabled: true\n---\n正文\n";
    expect(guardRestoredContent("Automations/r--rule-1.md", rule)).toContain("enabled: false");
    expect(guardRestoredContent("./Automations/r--rule-1.md", rule)).toContain("enabled: false");
    expect(guardRestoredContent("Automations//r--rule-1.md", rule)).toContain("enabled: false");
    expect(guardRestoredContent("automations/r--rule-1.md", rule)).toContain("enabled: false");
    expect(() => guardRestoredContent("../x.md", rule)).toThrow();
    expect(guardRestoredContent("Tasks/t.md", rule)).toBe(rule);
  });
  test("restore 钩子：先 transform 再写入，写入后触发 afterWrite", async () => {
    const { root, files, h } = setup();
    put(root, "Automations/r.md", "---\nenabled: true\n---\nx\n");
    await h.record("Automations/r.md", "edit");
    put(root, "Automations/r.md", "---\nenabled: false\n---\ny\n");
    await h.record("Automations/r.md", "edit");
    const oldest = (await h.timeline("Automations/r.md")).at(-1)!;
    let after = "";
    await h.restore("Automations/r.md", oldest.id, files.read("Automations/r.md")!.version, {
      transform: (t) => t.replace("enabled: true", "enabled: false"),
      afterWrite: (t) => {
        after = t;
      },
    });
    expect(readFileSync(path.join(root, "Automations/r.md"), "utf8")).toBe("---\nenabled: false\n---\nx\n");
    expect(after).toContain("enabled: false");
  });

  test("中文文件名：时间线路径不被转义，历史内容可读", async () => {
    const { root, h } = setup();
    put(root, "知识库/周报.md", "第一周");
    await h.record("知识库/周报.md", "edit");
    put(root, "知识库/周报.md", "第二周");
    await h.record("知识库/周报.md", "edit");
    const tl = await h.timeline("知识库/周报.md");
    expect(tl.map((e) => e.path)).toEqual(["知识库/周报.md", "知识库/周报.md"]);
    expect(await h.read(tl[1]!)).toBe("第一周");
  });
});

describe("审计回归", () => {
  test("history.read 拒绝以 -- 开头的 id（git 选项注入）", async () => {
    const { root, h } = setup();
    put(root, "n.md", "x");
    await h.record("n.md", "edit");
    await expect(h.read({ id: "--output=/tmp/pwned", path: "n.md" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(existsSync("/tmp/pwned:n.md")).toBe(false);
  });
  test("ACC-VS-03：任务恢复旧输入，但 completed 保持当前值", async () => {
    const { guardRestoredContent } = await import("../src/engine/index.js");
    const old = "---\nhuhu: {kind: task, id: task-1, schema: 1}\ntitle: 旧标题\ncompleted: false\ncompletedAt: null\n---\n旧正文\n";
    const cur = "---\nhuhu: {kind: task, id: task-1, schema: 1}\ntitle: 新标题\ncompleted: true\ncompletedAt: 2026-11-10T00:00:00Z\n---\n新正文\n";
    const out = guardRestoredContent("Tasks/t--task-1.md", old, cur);
    expect(out).toContain("title: 旧标题");
    expect(out).toContain("旧正文");
    expect(out).toContain("completed: true");
    expect(out).toContain("completedAt: 2026-11-10T00:00:00Z");
  });
});
