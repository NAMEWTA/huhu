import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { DEFAULT_GITIGNORE, VaultGit } from "../src/engine/repo.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-g-"));
  dirs.push(d);
  return d;
};
const put = (root: string, rel: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};

describe("VaultGit（ACC-VS-07）", () => {
  test("不是仓库：isRepo=false；init 创建仓库与默认 .gitignore，且不覆盖已有 .gitignore", async () => {
    const root = tmp();
    const g = new VaultGit(root);
    expect(g.isRepo()).toBe(false);
    await expect(g.status()).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const r = await g.init();
    expect(r).toEqual({ created: true, gitignore: DEFAULT_GITIGNORE });
    expect(readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(".huhu/runtime/");
    expect(await g.init()).toEqual({ created: false, gitignore: "" });
    const other = tmp();
    put(other, ".gitignore", "mine\n");
    await new VaultGit(other).init();
    expect(readFileSync(path.join(other, ".gitignore"), "utf8")).toBe("mine\n");
  });

  test("工作区/暂存区状态、暂存与取消暂存（含首个提交之前）、提交、日志与差异", async () => {
    const root = tmp();
    const g = new VaultGit(root);
    await g.init();
    put(root, "笔记/a.md", "第一行\n");
    put(root, ".huhu/runtime/x/engine.json", "{}");
    let st = await g.status();
    expect(st.files.find((f) => f.path === "笔记/a.md")).toMatchObject({ index: "?", worktree: "?" });
    expect(st.files.some((f) => f.path.startsWith(".huhu/runtime"))).toBe(false); // 被默认 .gitignore 忽略
    await g.stage(["笔记/a.md"]);
    expect((await g.status()).files.find((f) => f.path === "笔记/a.md")).toMatchObject({ index: "A" });
    await g.unstage(["笔记/a.md"]); // 无 HEAD 时也能取消暂存
    expect((await g.status()).files.find((f) => f.path === "笔记/a.md")).toMatchObject({ index: "?" });
    await g.stage(["笔记/a.md"]);
    await expect(g.commit("  ")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const c1 = await g.commit("-首次提交（以 - 开头也安全）");
    expect(c1.subject).toBe("-首次提交（以 - 开头也安全）");
    expect(c1.author).toBe("HUHU");
    await expect(g.commit("没有变更")).rejects.toThrow(/暂存区没有变更/);
    put(root, "笔记/a.md", "第一行\n第二行\n");
    st = await g.status();
    expect(st.files.find((f) => f.path === "笔记/a.md")).toMatchObject({ index: " ", worktree: "M" });
    const wd = await g.diff({ path: "笔记/a.md" });
    expect(wd).toContain("+第二行");
    await g.stage(["笔记/a.md"]);
    expect(await g.diff({ path: "笔记/a.md", staged: true })).toContain("+第二行");
    const c2 = await g.commit("第二次");
    expect((await g.log()).map((c) => c.subject)).toEqual(["第二次", "-首次提交（以 - 开头也安全）"]);
    expect(await g.diff({ commit: c2.id })).toContain("+第二行");
    expect((await g.status()).files).toEqual([{ path: ".gitignore", index: "?", worktree: "?" }]);
  });

  test("重命名在状态里带 from；路径越界与非法提交 id 被拒绝；以 - 开头的路径不被当成选项", async () => {
    const root = tmp();
    const g = new VaultGit(root);
    await g.init();
    put(root, "旧名.md", "内容内容内容内容\n");
    await g.stage(["旧名.md", ".gitignore"]);
    await g.commit("初始");
    execFileSync("git", ["-C", root, "mv", "旧名.md", "新名.md"]);
    const st = await g.status();
    expect(st.files.find((f) => f.path === "新名.md")).toMatchObject({ index: "R", from: "旧名.md" });
    await expect(g.stage(["../outside.md"])).rejects.toMatchObject({ code: "PATH_OUTSIDE_VAULT" });
    await expect(g.diff({ commit: "--output=/tmp/pwned" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(existsSync("/tmp/pwned")).toBe(false);
    put(root, "-rf.md", "x");
    await g.stage(["-rf.md"]); // 通过 -- 隔离，作为路径而不是选项
    expect((await g.status()).files.find((f) => f.path === "-rf.md")).toMatchObject({ index: "A" });
  });
});
