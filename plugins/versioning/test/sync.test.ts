import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VaultGit } from "../src/engine/repo.js";
import { VaultSync, classify } from "../src/engine/sync.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-sy-")); dirs.push(d); return d; };
const put = (root: string, rel: string, text: string) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), text); };
const git = (root: string, ...args: string[]) => execFileSync("git", ["-C", root, "-c", "core.quotepath=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

async function twoVaults() {
  const remote = tmp();
  execFileSync("git", ["init", "--bare", "-q", "--initial-branch=main", remote]);
  const a = (() => { const root = tmp(); return { root }; })();
  await new VaultGit(a.root).init();
  git(a.root, "checkout", "-q", "-b", "main");
  const asy = new VaultSync(a.root);
  asy.update({ remote, branch: "main", mode: "full" });
  // B 是另一台设备上的空副本：只做 git init，首次拉取时不能与本地同名文件冲突
  const broot = tmp();
  execFileSync("git", ["init", "-q", "--initial-branch=main", broot]);
  const bsy = new VaultSync(broot);
  bsy.update({ remote, branch: "main", mode: "full" });
  return { remote, a: { root: a.root, sync: asy }, b: { root: broot, sync: bsy } };
}

describe("纳入范围（ACC-VS-06）", () => {
  test("Markdown/附件与白名单内的 .huhu 文件纳入；runtime/cache/drafts/operations/claims/history 跳过", () => {
    for (const p of ["笔记/a.md", "img/x.png", ".huhu/vault.json", ".huhu/settings.json", ".huhu/notes/identities.json", ".huhu/safe/keyring.json", ".huhu/ssh/known_hosts"]) expect(classify(p, []).include, p).toBe(true);
    for (const p of [".huhu/runtime/m/engine.json", ".huhu/cache/x", ".huhu/drafts/note.json", ".huhu/operations/op.json", ".huhu/automations/claims/k.json", ".huhu/history/git/HEAD", ".huhu/ui/state.json", ".git/config"]) expect(classify(p, []).include, p).toBe(false);
  });
  test("用户追加的排除规则：目录、通配符、锚定", () => {
    const ex = ["private/", "*.tmp", "/draft.md", "a/**/secret.md"];
    expect(classify("private/x.md", ex).include).toBe(false);
    expect(classify("deep/private/x.md", ex).include).toBe(false);
    expect(classify("notes/x.tmp", ex).include).toBe(false);
    expect(classify("draft.md", ex).include).toBe(false);
    expect(classify("sub/draft.md", ex).include).toBe(true);
    expect(classify("a/b/c/secret.md", ex).include).toBe(false);
    expect(classify("notes/ok.md", ex).include).toBe(true);
  });
  test("配置校验：模式、分支、以 - 开头的远端", () => {
    const s = new VaultSync(tmp());
    expect(() => s.update({ mode: "weird" as never })).toThrow();
    expect(() => s.update({ remote: "--upload-pack=x" })).toThrow();
    expect(() => s.update({ branch: "-bad" })).toThrow();
    expect(s.update({ remote: "/tmp/x.git", branch: "main", mode: "follow" })).toMatchObject({ mode: "follow" });
  });
});

describe("同步", () => {
  test("预览：待推送与跳过分开列出；不是仓库 / 未配置远端时给出明确错误", async () => {
    const empty = new VaultSync(tmp());
    await expect(empty.preview()).rejects.toThrow(/不是 Git 仓库/);
    const root = tmp(); await new VaultGit(root).init();
    await expect(new VaultSync(root).preview()).rejects.toThrow(/尚未配置远端/);
    const { a } = await twoVaults();
    put(a.root, "笔记/a.md", "内容"); put(a.root, ".huhu/runtime/m/engine.json", "{}"); put(a.root, ".huhu/drafts/d.json", "{}"); put(a.root, ".huhu/settings.json", "{}");
    const p = await a.sync.preview();
    expect(p.push).toEqual(expect.arrayContaining(["笔记/a.md", ".huhu/settings.json"]));
    expect(p.push.some((x) => x.includes("runtime") || x.includes("drafts"))).toBe(false);
    // runtime 被默认 .gitignore 忽略所以不出现；drafts 不在 .gitignore 中，应出现在跳过里
    expect(p.skipped.map((s) => s.path)).toContain(".huhu/drafts/d.json");
  });

  test("A 推送，B 拉取：只带纳入范围的文件；用户自己的暂存区不被动", async () => {
    const { a, b, remote } = await twoVaults();
    put(a.root, "笔记/a.md", "来自 A"); put(a.root, ".huhu/drafts/d.json", "不应同步"); put(a.root, "私人.md", "用户自己暂存的");
    git(a.root, "add", "私人.md"); // 用户暂存了另一个文件
    const r = await a.sync.run("sync");
    expect(r).toMatchObject({ pushed: true, committed: true });
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).toContain("笔记/a.md");
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).not.toContain("drafts");
    expect(git(a.root, "diff", "--cached", "--name-only")).toBe(""); // 提交后与 HEAD 对齐（私人.md 在范围内被一并提交）
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).toContain("私人.md");
    const pulled = await b.sync.run("pull");
    expect(pulled.pulled).toBe(true);
    expect(readFileSync(path.join(b.root, "笔记/a.md"), "utf8")).toBe("来自 A");
    expect(existsSync(path.join(b.root, ".huhu/drafts/d.json"))).toBe(false);
  });

  test("ACC-VS-05 两边改同一行：第二个副本同步 → GIT_CONFLICT，回退合并、本地文件不变、状态 conflict、附冲突文件", async () => {
    const { a, b } = await twoVaults();
    put(a.root, "共享.md", "第一行\n共同的一行\n第三行\n");
    await a.sync.run("sync");
    await b.sync.run("pull");
    expect(readFileSync(path.join(b.root, "共享.md"), "utf8")).toContain("共同的一行");
    put(a.root, "共享.md", "第一行\nA 改的\n第三行\n"); await a.sync.run("sync");
    put(b.root, "共享.md", "第一行\nB 改的\n第三行\n");
    await expect(b.sync.run("sync")).rejects.toMatchObject({ code: "GIT_CONFLICT", details: { files: ["共享.md"] } });
    expect(readFileSync(path.join(b.root, "共享.md"), "utf8")).toBe("第一行\nB 改的\n第三行\n"); // 本地内容保留
    expect(git(b.root, "status", "--porcelain")).not.toMatch(/^UU/m); // 没有半合并状态
    expect(existsSync(path.join(b.root, ".git/MERGE_HEAD"))).toBe(false);
    expect(b.sync.status()).toMatchObject({ name: "conflict" });
  });

  test("离线/远端不存在 → GIT_OFFLINE 或可读错误，状态标记；本地文件不变", async () => {
    const { a } = await twoVaults();
    a.sync.update({ remote: path.join(tmp(), "nope.git") });
    put(a.root, "x.md", "x");
    await expect(a.sync.run("sync")).rejects.toBeTruthy();
    expect(readFileSync(path.join(a.root, "x.md"), "utf8")).toBe("x");
    expect(["offline", "unknown"]).toContain(a.sync.status().name);
  });
});
