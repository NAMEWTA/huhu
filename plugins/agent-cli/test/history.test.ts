import { appendFileSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { isPiHistoryFile, isValidNativeId, nativeHistorySourceMatches, scanHistory } from "../src/engine/history/scanner.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-hs-"));
  dirs.push(d);
  return d;
};
const jl = (...rows: unknown[]) => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;
const enc = (cwd: string) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

function claudeFile(home: string, cwd: string, id: string, rows: unknown[], at?: Date) {
  const dir = path.join(home, ".claude", "projects", enc(cwd));
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${id}.jsonl`);
  writeFileSync(f, jl(...rows));
  if (at) utimesSync(f, at, at);
  return f;
}
function codexFile(home: string, day: string, id: string, rows: unknown[], at?: Date) {
  const dir = path.join(home, ".codex", "sessions", ...day.split("-"));
  mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `rollout-${day}T10-00-00-${id}.jsonl`);
  writeFileSync(f, jl(...rows));
  if (at) utimesSync(f, at, at);
  return f;
}
const userRow = (cwd: string, text: unknown, over: Record<string, unknown> = {}) => ({ type: "user", cwd, sessionId: "x", isMeta: false, message: { role: "user", content: text }, ...over });

describe("历史扫描", () => {
  const nativeId = "f5806e5c-1127-424b-966c-22087b88af27";

  test("Claude 原生操作校验列表之外的同 UUID 候选及固定资料目录", () => {
    const home = tmp();
    const root = realpathSync(tmp());
    const profile = path.join(realpathSync(home), ".claude");
    claudeFile(home, root, nativeId, [userRow(root, "选定会话")]);
    const [selected] = scanHistory({ roots: [root], home, env: {} }).entries;
    expect(selected).toBeDefined();
    expect(nativeHistorySourceMatches(selected!, profile)).toBe(true);
    expect(nativeHistorySourceMatches(selected!, tmp())).toBe(false);
    claudeFile(home, tmp(), nativeId, ["无法解析的另一候选"]);
    expect(scanHistory({ roots: [root], home, env: {} }).entries).toHaveLength(1);
    expect(nativeHistorySourceMatches(selected!, profile)).toBe(false);
  });

  test("Codex 原生操作发现归档同 UUID 候选及选定文件被替换", () => {
    const home = tmp();
    const root = realpathSync(tmp());
    const profile = path.join(realpathSync(home), ".codex");
    const rows = [{ type: "session_meta", payload: { id: nativeId, cwd: root } }];
    const file = codexFile(home, "2026-11-04", nativeId, rows);
    const [selected] = scanHistory({ roots: [root], home, env: {} }).entries;
    expect(selected).toBeDefined();
    expect(nativeHistorySourceMatches(selected!, profile)).toBe(true);
    const archive = path.join(profile, "archived_sessions");
    mkdirSync(archive);
    const duplicate = path.join(archive, path.basename(file));
    writeFileSync(duplicate, "损坏候选");
    expect(nativeHistorySourceMatches(selected!, profile)).toBe(false);
    rmSync(duplicate);
    renameSync(file, `${file}.old`);
    writeFileSync(file, jl(...rows));
    expect(nativeHistorySourceMatches(selected!, profile)).toBe(false);
  });

  test("claude：按 cwd 归属 Space，标题取第一条真实提问（跳过命令包装与 meta），按时间倒序", async () => {
    const home = tmp();
    const root = tmp();
    claudeFile(home, root, "s-old", [{ type: "session-owner", sessionId: "s-old" }, userRow(root, "<command-name>/clear</command-name>"), userRow(root, "旧会话的提问", { sessionId: "s-old" })], new Date("2026-11-01T00:00:00Z"));
    claudeFile(home, root, "s-new", [userRow(root, [{ type: "text", text: "新会话\n多行  提问" }], { sessionId: "ancestor" })], new Date("2026-11-05T00:00:00Z"));
    const r = scanHistory({ roots: [root], home, env: {} });
    expect(r.entries.map((e) => [e.nativeSessionId, e.title])).toEqual([
      ["s-new", "新会话 多行 提问"],
      ["s-old", "旧会话的提问"],
    ]);
    expect(r.entries[0]).toMatchObject({ provider: "claude", cwd: realpathSync(root) }); // 扫描器按真实路径归属（macOS 的临时目录 /var 是 /private/var 的符号链接）
  });

  test("归属：子目录会话算入，同前缀的兄弟目录与外部目录不算", async () => {
    const home = tmp();
    const base = tmp();
    const root = path.join(base, "proj");
    const sub = path.join(root, "pkg");
    const sibling = path.join(base, "proj-other");
    const outside = tmp();
    for (const d of [root, sub, sibling]) mkdirSync(d, { recursive: true });
    claudeFile(home, root, "a", [userRow(root, "根")]);
    claudeFile(home, sub, "b", [userRow(sub, "子目录")]);
    claudeFile(home, sibling, "c", [userRow(sibling, "兄弟")]);
    claudeFile(home, outside, "d", [userRow(outside, "外部")]);
    expect(
      scanHistory({ roots: [root], home, env: {} })
        .entries.map((e) => e.nativeSessionId)
        .sort(),
    ).toEqual(["a", "b"]);
  });

  test("符号链接的 Space 根按真实路径归属", async () => {
    const home = tmp();
    const real = realpathSync(tmp());
    const link = path.join(tmp(), "link");
    symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir");
    claudeFile(home, real, "r", [userRow(real, "经链接")]);
    expect(scanHistory({ roots: [link], home, env: {} }).entries.map((e) => e.nativeSessionId)).toEqual(["r"]);
  });

  test("codex：session_meta 提供 id 与 cwd；标题取第一条用户消息（跳过 AGENTS.md 注入）", async () => {
    const home = tmp();
    const root = tmp();
    codexFile(home, "2026-11-04", "019-aaa", [
      { type: "session_meta", payload: { id: "019-aaa", cwd: root } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for x" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "帮我修复登录" }] } },
    ]);
    codexFile(home, "2026-11-05", "019-bbb", [{ type: "session_meta", payload: { id: "019-bbb", cwd: tmp() } }]); // 其他目录
    const r = scanHistory({ roots: [root], home, env: {} });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({ provider: "codex", nativeSessionId: "019-aaa", title: "帮我修复登录" });
  });

  test("CLAUDE_CONFIG_DIR 与 CODEX_HOME 覆盖默认位置", async () => {
    const home = tmp();
    const root = tmp();
    const cfg = tmp();
    const cx = tmp();
    const dir = path.join(cfg, "projects", enc(root));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "e.jsonl"), jl(userRow(root, "自定义位置")));
    mkdirSync(path.join(cx, "sessions"), { recursive: true });
    writeFileSync(path.join(cx, "sessions", "rollout-2026-11-06T00-00-00-x.jsonl"), jl({ type: "session_meta", payload: { id: "cx-1", cwd: root } }));
    const r = scanHistory({ roots: [root], home, env: { CLAUDE_CONFIG_DIR: cfg, CODEX_HOME: cx } });
    expect(r.entries.map((e) => e.nativeSessionId).sort()).toEqual(["cx-1", "e"]);
  });

  test("损坏的文件不影响其余：坏行被忽略，缺 cwd 的文件计入 skipped", async () => {
    const home = tmp();
    const root = tmp();
    const dir = path.join(home, ".claude", "projects", enc(root));
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "bad.jsonl"), '不是 json\n{"type":"user"\n');
    writeFileSync(path.join(dir, "good.jsonl"), `坏行\n${jl(userRow(root, "正常"))}`);
    const r = scanHistory({ roots: [root], home, env: {} });
    expect(r.entries.map((e) => e.nativeSessionId)).toEqual(["good"]);
    expect(r.skipped).toBe(1);
  });

  test("文件名里的 id 含奇怪字符 → 不返回（不能把任意字符串交给 CLI）", async () => {
    const home = tmp();
    const root = tmp();
    claudeFile(home, root, "--dangerously-skip-permissions", [{ type: "user", cwd: root, message: { content: "x" } }]);
    const r = scanHistory({ roots: [root], home, env: {} });
    expect(r.entries).toEqual([]);
    expect(isValidNativeId("--x")).toBe(false);
    expect(isValidNativeId("a b")).toBe(false);
    expect(isValidNativeId("019-abc_1.2")).toBe(true);
  });

  test("名字以 .. 开头的子目录不被误判为越界；已删除目录的会话不列出", async () => {
    const home = tmp();
    const root = tmp();
    const odd = path.join(root, "..notes");
    mkdirSync(odd);
    const gone = path.join(root, "gone");
    mkdirSync(gone);
    claudeFile(home, odd, "odd", [userRow(odd, "点点目录")]);
    claudeFile(home, gone, "gone", [userRow(gone, "已删除")]);
    rmSync(gone, { recursive: true });
    expect(scanHistory({ roots: [root], home, env: {} }).entries.map((e) => e.nativeSessionId)).toEqual(["odd"]);
  });

  test("经符号链接路径启动的 claude 会话（bucket 按链接路径编码）也能归属", async () => {
    const home = tmp();
    const real = tmp();
    const link = path.join(tmp(), "link");
    symlinkSync(real, link, process.platform === "win32" ? "junction" : "dir");
    claudeFile(home, link, "via-link", [userRow(real, "经链接启动")]);
    expect(scanHistory({ roots: [link], home, env: {} }).entries.map((e) => e.nativeSessionId)).toEqual(["via-link"]);
  });

  test("projects 不是目录或目录不可读 → 不抛错", async () => {
    const home = tmp();
    mkdirSync(path.join(home, ".claude"), { recursive: true });
    writeFileSync(path.join(home, ".claude", "projects"), "我是文件");
    expect(scanHistory({ roots: [tmp()], home, env: {} }).entries).toEqual([]);
  });

  test("Pi 在已绑定目录内按原生头读取，同 ID 的独立文件保留各自引用", () => {
    const home = tmp();
    const root = tmp();
    const override = tmp();
    const bucket = path.join(override, "--project--");
    mkdirSync(bucket);
    const entries = [
      ["旧记录", root],
      ["新记录", root],
      ["工作区外", tmp()],
      ["无效目录", "."],
    ] as const;
    for (const [title, cwd] of entries) {
      writeFileSync(path.join(bucket, `${title}.jsonl`), jl({ type: "session", version: 3, id: "same-id", cwd }, { type: "message", id: "prompt", parentId: null, message: { role: "user", content: [{ type: "text", text: title }] } }));
    }
    const options = { roots: [root], home, env: { PI_CODING_AGENT_SESSION_DIR: override } };
    const result = scanHistory(options);
    expect(result.skipped).toBe(1);
    expect(result.entries.map(({ provider, title }) => [provider, title]).sort()).toEqual(
      [
        ["pi", "新记录"],
        ["pi", "旧记录"],
      ].sort(),
    );
    const ids = result.entries.map(({ historyId }) => historyId);
    expect(new Set(ids).size).toBe(2);
    expect(scanHistory(options).entries.map(({ historyId }) => historyId)).toEqual(ids);
    expect(scanHistory({ ...options, env: {} }).entries).toEqual([]);
  });

  test("没有任何历史目录 → 空结果", () => {
    expect(scanHistory({ roots: [tmp()], home: tmp(), env: {} })).toEqual({ entries: [], skipped: 0, limitedProviders: [] });
  });

  test("Pi 文件追加保留身份，旧启动版本及同路径替换都拒绝", () => {
    const root = tmp();
    const history = tmp();
    const home = tmp();
    const file = path.join(history, "original.jsonl");
    const replacement = path.join(history, "replacement.tmp");
    const content = jl({ type: "session", version: 3, id: "original", cwd: root });
    writeFileSync(file, content);
    writeFileSync(replacement, content);
    const options = { roots: [root], home, env: { PI_CODING_AGENT_SESSION_DIR: history } };
    const initial = scanHistory(options).entries[0]!;
    expect(isPiHistoryFile(initial.file, initial.nativeSessionId, initial.historyId, initial.revision)).toBe(true);
    appendFileSync(file, jl({ type: "message", id: "a", parentId: null, message: { role: "user", content: "后来追加" } }));
    expect(scanHistory(options).entries[0]?.historyId).toBe(initial.historyId);
    expect(isPiHistoryFile(initial.file, initial.nativeSessionId, initial.historyId, initial.revision)).toBe(false);
    expect(isPiHistoryFile(initial.file, initial.nativeSessionId, initial.historyId)).toBe(true);
    rmSync(file);
    renameSync(replacement, file);
    expect(scanHistory(options).entries[0]?.historyId).not.toBe(initial.historyId);
    expect(isPiHistoryFile(initial.file, initial.nativeSessionId, initial.historyId)).toBe(false);
  });
});
