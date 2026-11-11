import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { LIMITS, parsePatch, reviewDiff } from "../src/engine/review.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-rv-"));
  dirs.push(d);
  return d;
};
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8" });
const put = (root: string, rel: string, text: string | Buffer) => {
  mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  writeFileSync(path.join(root, rel), text);
};
function repo() {
  const r = tmp();
  git(r, "init", "-q", "-b", "main");
  return r;
}

describe("变更审查：git diff HEAD", () => {
  test("不是 Git 仓库 → isRepo=false", async () => {
    expect(await reviewDiff(tmp())).toEqual({ isRepo: false, hasHead: false, truncated: false, files: [] });
  });

  test("修改 / 新增（已暂存）/ 删除 / 重命名 / 未跟踪 / 二进制：状态、统计、逐行号都对", async () => {
    const r = repo();
    put(r, "改.md", "一\n二\n三\n四\n五\n六\n七\n八\n九\n十\n");
    put(r, "删.txt", "要删除\n");
    put(r, "旧名.md", "这是一个足够长的文件\n让重命名检测可以识别\n第三行\n第四行\n");
    put(r, "bin.dat", Buffer.from([0, 1, 2, 3]));
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    put(r, "改.md", "一\n二\n三改\n四\n五\n六\n七\n八\n九\n十\n十一\n");
    rmSync(path.join(r, "删.txt"));
    git(r, "mv", "旧名.md", "新名.md");
    put(r, "暂存新增.md", "新文件\n");
    git(r, "add", "暂存新增.md");
    put(r, "bin.dat", Buffer.from([0, 9, 9, 9, 9]));
    put(r, "未跟踪/说明.md", "未跟踪的第一行\n第二行");
    const d = await reviewDiff(r);
    expect(d).toMatchObject({ isRepo: true, hasHead: true, truncated: false });
    const by = Object.fromEntries(d.files.map((f) => [f.path, f]));
    expect(by["改.md"]).toMatchObject({ status: "modified", additions: 2, deletions: 1, binary: false });
    expect(
      by["改.md"]!.hunks.flatMap((h) => h.lines)
        .filter((l) => l.kind === "add")
        .map((l) => [l.newLine, l.text]),
    ).toEqual([
      [3, "三改"],
      [11, "十一"],
    ]);
    expect(by["改.md"]!.hunks).toHaveLength(2); // 两处改动相距较远：两个 hunk
    expect(by["改.md"]!.hunks.flatMap((h) => h.lines).find((l) => l.kind === "del")).toMatchObject({ oldLine: 3, newLine: null, text: "三" });
    expect(by["删.txt"]).toMatchObject({ status: "deleted", deletions: 1 });
    expect(by["新名.md"]).toMatchObject({ status: "renamed", oldPath: "旧名.md" });
    expect(by["暂存新增.md"]).toMatchObject({ status: "added", additions: 1 });
    expect(by["bin.dat"]).toMatchObject({ binary: true, hunks: [] });
    expect(by["未跟踪/说明.md"]).toMatchObject({ status: "untracked", additions: 2 });
    expect(by["未跟踪/说明.md"]!.hunks[0]!.lines[1]).toMatchObject({ newLine: 2, text: "第二行", noNewline: true }); // 末尾无换行
  });

  test("没有任何提交（无 HEAD）：与空树比较，已暂存与未跟踪的文件都出现", async () => {
    const r = repo();
    put(r, "a.md", "a\n");
    git(r, "add", "a.md");
    put(r, "b.md", "b\n");
    const d = await reviewDiff(r);
    expect(d.hasHead).toBe(false);
    expect(d.files.map((f) => [f.path, f.status])).toEqual([
      ["a.md", "added"],
      ["b.md", "untracked"],
    ]);
  });

  test("Space 是仓库的子目录：只看这个子目录，路径相对于它", async () => {
    const r = repo();
    put(r, "sub/x.md", "x\n");
    put(r, "other/y.md", "y\n");
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    put(r, "sub/x.md", "x2\n");
    put(r, "other/y.md", "y2\n");
    const d = await reviewDiff(path.join(r, "sub"));
    expect(d.isRepo).toBe(true);
    expect(d.files.map((f) => f.path)).toEqual(["x.md"]);
  });

  test("仓库配置里的 diff.external / textconv 不会被执行", async () => {
    const r = repo();
    put(r, "a.md", "a\n");
    put(r, ".gitattributes", "*.md diff=evil\n");
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    const mark = path.join(tmp(), "executed");
    git(r, "config", "diff.external", `sh -c "touch ${mark}"`);
    git(r, "config", "diff.evil.textconv", `sh -c "touch ${mark}; cat" --`);
    put(r, "a.md", "b\n");
    const d = await reviewDiff(r);
    expect(d.files[0]!.hunks).toHaveLength(1);
    expect((await import("node:fs")).existsSync(mark)).toBe(false);
  });

  test("过大的文件只给统计；未跟踪的符号链接不跟随（不读它指向的文件）", async () => {
    const r = repo();
    put(r, "keep.md", "k\n");
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    put(r, "keep.md", `${"很长的一行\n".repeat(LIMITS.filePatchBytes / 4)}`);
    put(r, "huge-untracked.txt", "x".repeat(LIMITS.filePatchBytes + 1));
    symlinkSync("/etc/passwd", path.join(r, "link"));
    const d = await reviewDiff(r);
    const by = Object.fromEntries(d.files.map((f) => [f.path, f]));
    expect(by["keep.md"]).toMatchObject({ tooLarge: true, hunks: [] });
    expect(by["keep.md"]!.additions).toBeGreaterThan(1000);
    expect(by["huge-untracked.txt"]).toMatchObject({ tooLarge: true, hunks: [] });
    expect(by["link"]).toMatchObject({ tooLarge: true, hunks: [] }); // 没有读 /etc/passwd
  });
});

describe("变更审查：文件名与路径的边界", () => {
  test("文件名里的通配符按字面处理：a*b.txt 的 diff 不会混入 aXb.txt", async () => {
    const r = repo();
    put(r, "a*b.txt", "星\n");
    put(r, "aXb.txt", "X\n");
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    put(r, "a*b.txt", "星2\n");
    put(r, "aXb.txt", "X2\n");
    const d = await reviewDiff(r);
    const star = d.files.find((f) => f.path === "a*b.txt")!;
    expect(
      star.hunks
        .flatMap((h) => h.lines)
        .filter((l) => l.kind === "add")
        .map((l) => l.text),
    ).toEqual(["星2"]);
  });
  test("含 tab 的文件名：统计与二进制标记仍然正确", async () => {
    const r = repo();
    put(r, "带\t制表.bin", Buffer.from([0, 1]));
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    put(r, "带\t制表.bin", Buffer.from([0, 2, 3]));
    const d = await reviewDiff(r);
    expect(d.files[0]).toMatchObject({ path: "带\t制表.bin", binary: true });
  });
  test("未跟踪文件很多时：只读取上限之内的，其余标记 truncated", async () => {
    const r = repo();
    put(r, "seed.md", "s\n");
    git(r, "add", "-A");
    git(r, "commit", "-qm", "init");
    for (let i = 0; i < LIMITS.files + 20; i++) put(r, `u/${String(i).padStart(4, "0")}.md`, "x\n");
    const d = await reviewDiff(r);
    expect(d.files.length).toBe(LIMITS.files);
    expect(d.truncated).toBe(true);
  }, 30_000);
});

describe("parsePatch", () => {
  test("多个 hunk、新旧行号推进、\\ No newline 标记", () => {
    const hunks = parsePatch("diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n 甲\n-乙\n+丙\n\\ No newline at end of file\n@@ -10 +10,2 @@\n 末\n+加\n");
    expect(hunks).toHaveLength(2);
    expect(hunks[0]!.lines.map((l) => [l.kind, l.oldLine, l.newLine])).toEqual([
      ["ctx", 1, 1],
      ["del", 2, null],
      ["add", null, 2],
    ]);
    expect(hunks[0]!.lines[2]!.noNewline).toBe(true);
    expect(hunks[1]).toMatchObject({ oldStart: 10, oldLines: 1, newStart: 10, newLines: 2 });
  });
});
