import { closeSync, fstatSync, openSync, readSync } from "node:fs";

/** 历史会话的只读记录：只取对话文本（用户/助手），工具调用与思考过程不展示。 */
export interface TranscriptMessage {
  role: "user" | "assistant";
  text: string;
  at: string | null;
}

export interface Transcript {
  messages: TranscriptMessage[];
  /** 文件太大或消息太多，只展示了最近的一部分。 */
  truncated: boolean;
}

/** 最多读取文件尾部这么多字节；记录是追加写入的，最近的对话在尾部。 */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 200;
const MAX_TEXT = 8000;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function blocksText(content: unknown, types: string[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const b of content) {
    const r = obj(b);
    const t = r && types.includes(String(r["type"])) ? str(r["text"]) : null;
    if (t) out.push(t);
  }
  return out.join("\n");
}

/** 环境注入、命令包装不是对话内容。 */
function meaningful(t: string): boolean {
  const s = t.trim();
  return s !== "" && !s.startsWith("<") && !s.startsWith("# AGENTS.md") && !s.startsWith("Caveat:");
}

function readTail(file: string): { text: string; cut: boolean } {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const len = Math.min(size, MAX_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    let text = buf.toString("utf8");
    const cut = size > len;
    if (cut) text = text.slice(text.indexOf("\n") + 1); // 第一行可能被截断
    return { text, cut };
  } finally {
    closeSync(fd);
  }
}

export function readTranscript(provider: "claude" | "codex", file: string): Transcript {
  const { text, cut } = readTail(file);
  const messages: TranscriptMessage[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let r: Record<string, unknown> | null;
    try {
      r = obj(JSON.parse(line));
    } catch {
      continue;
    }
    if (!r) continue;
    let role: "user" | "assistant" | null = null;
    let body = "";
    if (provider === "claude") {
      if ((r["type"] !== "user" && r["type"] !== "assistant") || r["isMeta"] === true || r["isSidechain"] === true) continue;
      role = r["type"];
      body = blocksText(obj(r["message"])?.["content"], ["text"]);
    } else {
      const p = obj(r["payload"]);
      if (r["type"] !== "response_item" || !p || p["type"] !== "message" || (p["role"] !== "user" && p["role"] !== "assistant")) continue;
      role = p["role"];
      body = blocksText(p["content"], ["input_text", "output_text", "text"]);
    }
    if (!role || !meaningful(body)) continue;
    messages.push({ role, text: body.length > MAX_TEXT ? `${body.slice(0, MAX_TEXT)}…` : body, at: str(r["timestamp"]) });
  }
  const truncated = cut || messages.length > MAX_MESSAGES;
  return { messages: messages.slice(-MAX_MESSAGES), truncated };
}
