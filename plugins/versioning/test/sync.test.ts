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

describe("审计回归", () => {
  test("文件名里的通配符不是 pathspec：排除的 xsecret.md 不会被纳入文件 x* 带上远端", async () => {
    const { a, remote } = await twoVaults();
    a.sync.update({ exclude: ["xsecret.md"] });
    put(a.root, "x*", "纳入"); put(a.root, "xsecret.md", "不应上传");
    await a.sync.run("sync");
    const tree = git(remote, "ls-tree", "-r", "--name-only", "main");
    expect(tree).toContain("x*");
    expect(tree).not.toContain("xsecret.md");
  });
  test("暂存的重命名不会让同步失败（旧路径条目被跳过）", async () => {
    const { a } = await twoVaults();
    put(a.root, "旧名字.md", "内容内容内容内容内容\n"); git(a.root, "add", "旧名字.md"); git(a.root, "commit", "-q", "-m", "init");
    git(a.root, "mv", "旧名字.md", "新名字.md");
    const p = await a.sync.preview();
    expect(p.push).toContain("新名字.md");
    await expect(a.sync.run("sync")).resolves.toMatchObject({ pushed: true });
  });
  test("用户手动暂存的内容在同步后保留；没暂存过的路径与新 HEAD 对齐", async () => {
    const { a } = await twoVaults();
    put(a.root, "keep.md", "v1\n"); git(a.root, "add", "keep.md"); git(a.root, "commit", "-q", "-m", "base");
    put(a.root, "keep.md", "STAGED\n"); git(a.root, "add", "keep.md");
    put(a.root, "keep.md", "WORKTREE\n");
    put(a.root, "other.md", "o\n");
    await a.sync.run("sync");
    expect(git(a.root, "show", ":keep.md")).toBe("STAGED\n"); // 用户暂存的版本还在 index 里
    expect(git(a.root, "diff", "--cached", "--name-only")).toContain("keep.md");
    expect(git(a.root, "status", "--porcelain")).not.toContain("other.md"); // 其余已与 HEAD 对齐
  });
  test("合并被未纳入的脏文件拒绝时，不谎报为冲突", async () => {
    const { a, b } = await twoVaults();
    put(a.root, ".huhu/settings.json", "{\"from\":\"a\"}"); await a.sync.run("sync");
    put(b.root, ".huhu/settings.json", "{\"local\":true}"); // B 本地同名未跟踪文件，会被拉取覆盖
    const err = await b.sync.run("pull").catch((e: { code: string }) => e);
    expect((err as { code: string }).code).not.toBe("GIT_CONFLICT");
    expect(readFileSync(path.join(b.root, ".huhu/settings.json"), "utf8")).toBe("{\"local\":true}");
  });
  test("暂存重命名成被排除的新名字：旧文件在远端被删除，新文件不上传", async () => {
    const { a, remote } = await twoVaults();
    a.sync.update({ exclude: ["secret.md"] });
    put(a.root, "old.md", "内容内容内容内容\n"); await a.sync.run("sync");
    expect(git(remote, "ls-tree", "-r", "--name-only", "main")).toContain("old.md");
    git(a.root, "mv", "old.md", "secret.md");
    await a.sync.run("sync");
    const tree = git(remote, "ls-tree", "-r", "--name-only", "main");
    expect(tree).not.toContain("old.md");
    expect(tree).not.toContain("secret.md");
  });

  test("配置校验：间隔 30–3600 整数；远端地址不能带用户名密码/令牌，但 ssh 用户名可以", async () => {
    const { a } = await twoVaults();
    expect(a.sync.update({ pullIntervalSec: 45, pushIntervalSec: 120 })).toMatchObject({ pullIntervalSec: 45, pushIntervalSec: 120 });
    for (const bad of [29, 3601, 60.5, Number.NaN]) expect(() => a.sync.update({ pullIntervalSec: bad })).toThrow(/30–3600/);
    expect(() => a.sync.update({ remote: "https://user:ghp_secret@github.com/x/y.git" })).toThrow(/用户名密码或令牌/);
    expect(() => a.sync.update({ remote: "https://:ghp_secret@github.com/x/y.git" })).toThrow(/用户名密码或令牌/);
    expect(() => a.sync.update({ remote: "https://ghp_onlytoken@github.com/x/y.git" })).toThrow(/用户名密码或令牌/); // 只有令牌的写法
    expect(a.sync.update({ remote: "ssh://git@github.com/x/y.git" }).remote).toBe("ssh://git@github.com/x/y.git");
    expect(a.sync.update({ remote: "git@github.com:x/y.git" }).remote).toBe("git@github.com:x/y.git");
    expect(a.sync.config().pullIntervalSec).toBe(45); // 旧配置缺字段时用默认值，已有字段保留
  });

  test("配置文件里手改成非法间隔：读取时回退默认值", async () => {
    const { a } = await twoVaults();
    a.sync.update({ remote: a.sync.config().remote });
    writeFileSync(path.join(a.root, ".huhu/sync/config.json"), JSON.stringify({ ...a.sync.config(), pullIntervalSec: "abc", pushIntervalSec: 5 }));
    expect(a.sync.config()).toMatchObject({ pullIntervalSec: 30, pushIntervalSec: 60 });
  });
});
