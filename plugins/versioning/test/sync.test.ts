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

  test("保险箱凭据：经一次性 GIT_ASKPASS 传给 git（服务端收到 Basic 认证），配置里只有引用，错误信息不含秘密，脚本目录用完即删", async () => {
    const http = await import("node:http");
    const { readdirSync } = await import("node:fs");
    const seen: string[] = [];
    const srv = http.createServer((req, res) => {
      const a = req.headers.authorization;
      if (!a) { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="x"' }); res.end(); return; }
      seen.push(a); res.writeHead(404); res.end("not a repo");
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      const root = tmp();
      await new VaultGit(root).init();
      const asked: string[] = [];
      const sync = new VaultSync(root, undefined, {}, (ref) => { asked.push(ref); return "s3cr3t-tok3n"; });
      sync.update({ remote: `http://127.0.0.1:${port}/r.git`, credential: "safe://item-1", credentialUser: "alice" });
      const before = readdirSync(tmpdir()).filter((f) => f.startsWith("huhu-askpass-")).length;
      const err = await sync.run("pull").catch((e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).not.toContain("s3cr3t-tok3n");
      expect(asked).toEqual(["safe://item-1"]);
      expect(seen[0]).toBe(`Basic ${Buffer.from("alice:s3cr3t-tok3n").toString("base64")}`);
      expect(readFileSync(path.join(root, ".huhu/sync/config.json"), "utf8")).not.toContain("s3cr3t-tok3n");
      expect(sync.config().credential).toBe("safe://item-1");
      expect(readdirSync(tmpdir()).filter((f) => f.startsWith("huhu-askpass-")).length).toBe(before); // 没有残留
    } finally {
      srv.close();
    }
  });

  test("保险箱锁定：同步失败并标记为认证失败（需要重新配置/解锁），不会去连远端", async () => {
    const { HuhuError } = await import("@huhu/contracts");
    const root = tmp();
    await new VaultGit(root).init();
    const sync = new VaultSync(root, undefined, {}, () => { throw new HuhuError("SAFE_LOCKED", "保险箱已锁定"); });
    sync.update({ remote: "https://example.invalid/r.git", credential: "safe://item-1" });
    await expect(sync.run("sync")).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    expect(sync.status()).toMatchObject({ name: "auth-failed" });
  });

  test("凭据配置校验：只接受 safe:// 引用与合法用户名；file/ssh 远端不使用凭据", async () => {
    const { a } = await twoVaults();
    expect(() => a.sync.update({ credential: "ghp_plain_token" })).toThrow(/凭据引用格式无效/);
    expect(() => a.sync.update({ credential: "safe://a/b" })).toThrow(/凭据引用格式无效/);
    expect(() => a.sync.update({ credentialUser: "bad name" })).toThrow(/用户名无效/);
    expect(a.sync.update({ credential: "safe://item-9", credentialUser: "bob" })).toMatchObject({ credential: "safe://item-9", credentialUser: "bob" });
    a.sync.update({ credential: "safe://item-9" });
    await a.sync.run("sync"); // 本地 bare 远端：不会调用（也不需要）保险箱
  });

  test("系统 credential helper 不会抢先或存走令牌：同步只使用保险箱令牌，helper 文件不被写入", async () => {
    const http = await import("node:http");
    const seen: string[] = [];
    const srv = http.createServer((req, res) => {
      const a = req.headers.authorization;
      if (!a) { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="x"' }); res.end(); return; }
      seen.push(a); res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    const dir = tmp();
    const store = path.join(dir, "git-credentials");
    writeFileSync(store, `http://other:wrongtoken@127.0.0.1:${port}\n`);
    const gcfg = path.join(dir, "gitconfig");
    writeFileSync(gcfg, `[credential]\n\thelper = store --file=${store}\n`);
    const old = process.env["GIT_CONFIG_GLOBAL"];
    process.env["GIT_CONFIG_GLOBAL"] = gcfg;
    try {
      const root = tmp();
      await new VaultGit(root).init();
      const sync = new VaultSync(root, undefined, {}, () => "vault-token");
      sync.update({ remote: `http://127.0.0.1:${port}/r.git`, credential: "safe://item-1", credentialUser: "alice" });
      await sync.run("pull").catch(() => undefined);
      expect(seen.length).toBeGreaterThan(0);
      for (const a of seen) expect(a).toBe(`Basic ${Buffer.from("alice:vault-token").toString("base64")}`);
      expect(readFileSync(store, "utf8")).toBe(`http://other:wrongtoken@127.0.0.1:${port}\n`); // 没有被 approve 写入
    } finally {
      if (old === undefined) delete process.env["GIT_CONFIG_GLOBAL"]; else process.env["GIT_CONFIG_GLOBAL"] = old;
      srv.close();
    }
  });

  test("重定向到别的主机时不交出令牌（askpass 只回答配置主机的提示）", async () => {
    const http = await import("node:http");
    const seenOther: string[] = [];
    const other = http.createServer((req, res) => {
      if (!req.headers.authorization) { res.writeHead(401, { "WWW-Authenticate": 'Basic realm="o"' }); res.end(); return; }
      seenOther.push(req.headers.authorization); res.writeHead(404); res.end();
    });
    await new Promise<void>((r) => other.listen(0, "127.0.0.1", r));
    const otherPort = (other.address() as { port: number }).port;
    const first = http.createServer((_req, res) => { res.writeHead(302, { Location: `http://localhost:${otherPort}/r.git/info/refs?service=git-upload-pack` }); res.end(); });
    await new Promise<void>((r) => first.listen(0, "127.0.0.1", r));
    const port = (first.address() as { port: number }).port;
    try {
      const root = tmp();
      await new VaultGit(root).init();
      const sync = new VaultSync(root, undefined, {}, () => "vault-token");
      sync.update({ remote: `http://127.0.0.1:${port}/r.git`, credential: "safe://item-1", credentialUser: "alice" });
      await sync.run("pull").catch(() => undefined);
      expect(seenOther).toEqual([]);
    } finally {
      first.close(); other.close();
    }
  });

  test("凭据只能用于 https（或本机回环 http）；file / ssh 远端从不调用保险箱", async () => {
    const calls: string[] = [];
    const { a } = await twoVaults();
    const bare = a.sync.config().remote; // 本地 bare 远端（file 路径）
    const sync = new VaultSync(a.root, undefined, {}, (ref) => { calls.push(ref); return "t"; });
    expect(() => sync.update({ remote: "http://git.example.com/r.git", credential: "safe://item-1" })).toThrow(/https/);
    expect(sync.update({ remote: "https://git.example.com/r.git", credential: "safe://item-1" }).credential).toBe("safe://item-1");
    expect(() => sync.update({ credential: "safe://other" })).toThrow(/凭据引用格式无效/); // 与保险箱的 item-… 格式一致
    sync.update({ remote: bare, credential: "safe://item-1" });
    await sync.run("sync");
    expect(calls).toEqual([]);
  }, 30_000);

  test("askpass 脚本：主机必须精确匹配（含端口、不分大小写）；名字相似的主机、不同端口、无法解析的提示都拒绝", async () => {
    const { POSIX_ASKPASS } = await import("../src/engine/sync.js");
    const { spawnSync } = await import("node:child_process");
    const f = path.join(tmp(), "askpass.sh");
    writeFileSync(f, POSIX_ASKPASS, { mode: 0o700 });
    const ask = (prompt: string, host = "git.example.com") => spawnSync("sh", [f, prompt], { env: { PATH: process.env["PATH"] ?? "", HUHU_GIT_HOST: host, HUHU_GIT_USER: "alice", HUHU_GIT_TOKEN: "tok en!&^%" }, encoding: "utf8" });
    expect(ask("Username for 'https://git.example.com': ")).toMatchObject({ status: 0, stdout: "alice" });
    expect(ask("Password for 'https://alice@git.example.com': ")).toMatchObject({ status: 0, stdout: "tok en!&^%" }); // 特殊字符原样输出
    expect(ask("Password for 'https://alice@GIT.Example.com/': ")).toMatchObject({ status: 0, stdout: "tok en!&^%" });
    expect(ask("Password for 'https://alice@git.example.com:8443': ", "git.example.com:8443")).toMatchObject({ status: 0 });
    for (const bad of [
      "Password for 'https://alice@git.example.com.evil.example': ",
      "Password for 'https://alice@evilgit.example.com': ",
      "Password for 'https://git.example.com@evil.example': ",
      "Password for 'https://alice@git.example.com:9999': ",
      "Password for 'https://other.example.org': ",
      "Password: ",
      "",
    ]) {
      const r = ask(bad);
      expect(r.status, bad).not.toBe(0);
      expect(r.stdout, bad).toBe("");
    }
  });
});
