import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readTranscript } from "../src/engine/history/transcript.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function file(rows: unknown[], raw = ""): string {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-tr-"));
  dirs.push(d);
  const f = path.join(d, "s.jsonl");
  writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n" + raw);
  return f;
}

describe("历史记录只读查看", () => {
  test("claude：只取用户/助手文字；跳过 meta、sidechain、工具调用、命令包装与坏行", () => {
    const f = file(
      [
        { type: "user", message: { content: "<command-name>/clear</command-name>" } },
        { type: "user", isMeta: true, message: { content: "meta" } },
        { type: "user", timestamp: "2026-11-05T01:00:00Z", message: { content: "你好" } },
        {
          type: "assistant",
          message: {
            content: [
              { type: "thinking", text: "内心" },
              { type: "text", text: "你好，我能帮你什么？" },
              { type: "tool_use", name: "Bash" },
            ],
          },
        },
        { type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "子任务" }] } },
      ],
      "{not json\n",
    );
    const r = readTranscript("claude", f);
    expect(r.messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "你好"],
      ["assistant", "你好，我能帮你什么？"],
    ]);
    expect(r.messages[0]?.at).toBe("2026-11-05T01:00:00Z");
    expect(r.truncated).toBe(false);
  });

  test("codex：response_item 的 message；AGENTS.md 注入被跳过", () => {
    const f = file([
      { type: "session_meta", payload: { id: "x", cwd: "/" } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "整理笔记" }] } },
      { type: "response_item", payload: { type: "function_call", name: "shell" } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "已整理" }] } },
    ]);
    expect(readTranscript("codex", f).messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "整理笔记"],
      ["assistant", "已整理"],
    ]);
  });

  test("消息过多只保留最近 200 条并标记 truncated", () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ type: "user", message: { content: `m${i}` } }));
    const r = readTranscript("claude", file(rows));
    expect(r.messages).toHaveLength(200);
    expect(r.messages.at(-1)?.text).toBe("m249");
    expect(r.truncated).toBe(true);
  });
});
