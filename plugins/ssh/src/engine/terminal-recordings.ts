import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { maxRecordingCheckpoints, RecordingContent, RecordingSummary, RecordingTimeline, type PlaybackCheckpoint } from "../shared/recordings.js";
import type { SshManager } from "./manager.js";

const bytesPerRecording = 256 * 1024;
const maxFileSize = 7 * bytesPerRecording;
const maxActive = 8;
const maxSaved = 60;
const recordingFile = /^([a-f0-9-]{36})\.json$/u;
const savedRecording = RecordingContent.extend({ timeline: z.unknown().optional() });

// OSC, other control strings, CSI, ESC sequences, and remaining C0/C1 controls.
// Keep line endings and tabs. Match before applying checkpoints so split controls
// (including incomplete ones at the capture limit) never become playback text.
const terminalControls =
  // eslint-disable-next-line no-control-regex
  /(?:\x1b\]|\u009d)[^\x07\x1b\u009c]*(?:\x07|\x1b\\|\u009c)?|(?:\x1b[PX^_]|[\u0090\u0098\u009e\u009f])[^\x1b\u009c]*(?:\x1b\\|\u009c)?|(?:\x1b\[|\u009b)[0-?]*[ -/]*[@-~]?|\x1b[ -/]*[0-~]?|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\u009f]/gu;

type Active = {
  summary: RecordingSummary;
  startedMs: number;
  durationMs?: number;
  bytes: number;
  buffer: Buffer;
  checkpoints: PlaybackCheckpoint[];
  bucketMs: number;
  detach(): void;
};

function activeSummary({ summary }: Active): RecordingSummary {
  return { ...summary, ...(summary.endedAt && { savePending: true as const }) };
}

function capture(active: Active, bytes: Buffer) {
  if (active.durationMs !== undefined) return;
  const remaining = bytesPerRecording - active.bytes;
  if (bytes.length > remaining) active.summary.truncated = true;
  if (!remaining || !bytes.length) return;
  active.bytes += bytes.copy(active.buffer, active.bytes, 0, remaining);

  const atMs = Math.max(1, Math.ceil(performance.now() - active.startedMs));
  const last = active.checkpoints.at(-1);
  if (last && Math.floor(last.atMs / active.bucketMs) === Math.floor(atMs / active.bucketMs)) {
    last.atMs = atMs;
    last.end = active.bytes;
    return;
  }
  active.checkpoints.push({ atMs, end: active.bytes });
  // Keep the last timestamp and byte boundary per bucket when output gets dense.
  // This bounds the index independently of how the transport splits its writes.
  while (active.checkpoints.length > maxRecordingCheckpoints) {
    active.bucketMs *= 2;
    const buckets = new Map(active.checkpoints.map((point) => [Math.floor(point.atMs / active.bucketMs), point]));
    active.checkpoints = [...buckets.values()];
  }
}

function isUsableTimeline(timeline: RecordingTimeline, text: string) {
  let atMs = 0;
  let end = 0;
  for (const point of timeline.checkpoints) {
    if (point.atMs <= atMs || point.atMs > timeline.durationMs || point.end <= end || point.end > text.length) return false;
    // A checkpoint must not split a UTF-16 surrogate pair.
    const next = text.charCodeAt(point.end);
    if (next >= 0xdc00 && next <= 0xdfff) return false;
    ({ atMs, end } = point);
  }
  return end === text.length;
}

export class TerminalRecordings {
  private readonly active = new Map<string, Active>();

  constructor(
    private readonly manager: Pick<SshManager, "shellInfo" | "attachShell">,
    private readonly directory: string,
    private readonly changed: (id: string) => void = () => {},
  ) {}

  start(shellId: string): RecordingSummary {
    const shell = this.manager.shellInfo(shellId);
    if (shell?.state !== "running") throw errors.notFound("活动的 SSH Shell");
    const existing = this.active.get(shellId);
    if (existing) return activeSummary(existing);
    if (this.active.size >= maxActive) throw errors.invalidInput("最多同时录制 8 个 Shell");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const summary: RecordingSummary = { id: randomUUID(), shellId, hostId: shell.hostId, label: shell.name, startedAt: new Date().toISOString(), endedAt: null, truncated: false, reason: null };
    const active: Active = {
      summary,
      startedMs: performance.now(),
      bytes: 0,
      buffer: Buffer.allocUnsafe(bytesPerRecording),
      checkpoints: [],
      bucketMs: 1,
      detach: () => {},
    };
    const view = this.manager.attachShell(
      shellId,
      {
        onData: (bytes) => capture(active, bytes),
        onEnd: () => {
          try {
            this.finish(active, "shell-ended");
          } catch {
            // Keep the stopped recording in memory so that a failed write can be retried explicitly.
          }
        },
      },
      false,
    );
    if (!view) throw errors.notFound("活动的 SSH Shell");
    active.detach = view.detach;
    this.active.set(shellId, active);
    this.changed(summary.id);
    return { ...summary };
  }

  stop(shellId: string): RecordingSummary {
    const active = this.active.get(shellId);
    if (!active) throw errors.notFound("此 SSH Shell 的当前录制");
    return this.finish(active, "stopped");
  }

  list(shellId?: string): RecordingSummary[] {
    const ongoing = [...this.active.values()].map(activeSummary);
    const disk = this.saved().flatMap((id) => {
      const content = this.readSaved(id, false);
      return content ? [content.summary] : [];
    });
    return [...ongoing, ...disk].filter((item) => !shellId || item.shellId === shellId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  read(id: string): RecordingContent {
    const own = [...this.active.values()].find(({ summary }) => summary.id === id);
    const value = own ? { ...this.content(own), summary: activeSummary(own) } : this.readSaved(id);
    if (!value) throw errors.notFound("SSH 录制");
    return value;
  }

  dispose(): void {
    for (const active of this.active.values()) {
      try {
        this.finish(active, "vault-closed");
      } catch {
        active.detach();
      }
    }
    this.active.clear();
  }

  private finish(active: Active, reason: NonNullable<RecordingSummary["reason"]>): RecordingSummary {
    if (this.active.get(active.summary.shellId) !== active) return { ...active.summary };
    active.durationMs ??= Math.max(active.checkpoints.at(-1)?.atMs ?? 0, Math.ceil(performance.now() - active.startedMs));
    active.detach();
    active.summary.endedAt ??= new Date().toISOString();
    active.summary.reason ??= reason;
    const content = this.content(active);
    const file = path.join(this.directory, content.summary.id + ".json");
    const temporary = file + ".tmp";
    try {
      writeFileSync(temporary, JSON.stringify(content), { mode: 0o600, flag: "wx", flush: true });
      renameSync(temporary, file);
    } catch (error) {
      this.changed(content.summary.id);
      throw error;
    } finally {
      rmSync(temporary, { force: true });
    }
    this.active.delete(active.summary.shellId);
    // The record is committed above. A cleanup failure cannot change the stop result.
    try {
      for (const id of this.saved().slice(maxSaved)) rmSync(path.join(this.directory, id + ".json"), { force: true });
    } catch {
      // A subsequent stop retries the retention cleanup.
    }
    this.changed(content.summary.id);
    return content.summary;
  }

  private content({ summary, buffer, bytes, durationMs, checkpoints }: Active): RecordingContent {
    const decoder = new StringDecoder("utf8");
    if (durationMs === undefined) {
      return { summary: { ...summary }, text: decoder.write(buffer.subarray(0, bytes)).replace(terminalControls, "") };
    }

    const decoded: string[] = [];
    const offsets: PlaybackCheckpoint[] = [];
    let previousByte = 0;
    let textEnd = 0;
    for (const { atMs, end } of checkpoints) {
      const part = decoder.write(buffer.subarray(previousByte, end));
      previousByte = end;
      decoded.push(part);
      textEnd += part.length;
      offsets.push({ atMs, end: textEnd });
    }
    if (!summary.truncated) {
      const tail = decoder.end();
      decoded.push(tail);
      textEnd += tail.length;
      if (tail) {
        // Counts toward the last captured bytes even if decoding needs EOF.
        offsets.at(-1)!.end = textEnd;
      }
    }

    const visible: PlaybackCheckpoint[] = [];
    let next = 0;
    let removed = 0;
    function addThrough(rawEnd: number, controlStart: number) {
      while (next < offsets.length && offsets[next]!.end <= rawEnd) {
        const point = offsets[next++]!;
        const end = Math.min(point.end, controlStart) - removed;
        if (end > (visible.at(-1)?.end ?? 0)) visible.push({ atMs: point.atMs, end });
      }
    }
    const text = decoded.join("").replace(terminalControls, (control: string, start: number) => {
      addThrough(start + control.length, start);
      removed += control.length;
      return "";
    });
    addThrough(textEnd, textEnd);
    return { summary: { ...summary }, text, timeline: { durationMs, checkpoints: visible } };
  }

  private saved(): string[] {
    try {
      return readdirSync(this.directory, { withFileTypes: true })
        .flatMap((entry) => {
          const id = entry.isFile() && recordingFile.exec(entry.name)?.[1];
          if (!id) return [];
          const stat = lstatSync(path.join(this.directory, entry.name), { throwIfNoEntry: false });
          return stat ? [{ id, at: stat.mtimeMs }] : [];
        })
        .sort((a, b) => b.at - a.at)
        .map(({ id }) => id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private readSaved(id: string, includeTimeline = true): RecordingContent | undefined {
    if (!RecordingSummary.shape.id.safeParse(id).success) return undefined;
    const file = path.join(this.directory, id + ".json");
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > maxFileSize) return undefined;
    try {
      const { summary, text, timeline } = savedRecording.parse(JSON.parse(readFileSync(file, "utf8")));
      if (summary.id !== id) return undefined;
      if (includeTimeline && timeline !== undefined) {
        const parsed = RecordingTimeline.safeParse(timeline);
        if (parsed.success && isUsableTimeline(parsed.data, text)) return { summary, text, timeline: parsed.data };
      }
      return { summary, text };
    } catch {
      return undefined;
    }
  }
}

const desktop = { plugin: "ssh", desktopOnly: true, exposable: true, defaultExposed: false, risk: "normal" } as const;
const shellId = z.strictObject({ shellId: RecordingSummary.shape.shellId });
export const sshRecordingDescriptors = {
  recordingsList: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.recordings.list",
    title: "列出 SSH 会话录制",
    description: "读取本设备的录制元数据，可按 Shell ID 筛选。",
    scope: "read",
    input: shellId.partial(),
    output: z.array(RecordingSummary),
  }),
  recordingsRead: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.recordings.read",
    title: "读取 SSH 会话录制",
    description: "读取指定的录制文本与截断状态。",
    scope: "read",
    input: RecordingSummary.pick({ id: true }),
    output: RecordingContent,
  }),
  recordingsStart: defineCapabilityDescriptor({ ...desktop, name: "ssh.recordings.start", title: "开始 SSH 录制", description: "从此刻开始记录一个 Shell 的输出。", scope: "write", input: shellId, output: RecordingSummary }),
  recordingsStop: defineCapabilityDescriptor({ ...desktop, name: "ssh.recordings.stop", title: "结束 SSH 录制", description: "停止捕获并保存当前 Shell 的录制。", scope: "write", input: shellId, output: RecordingSummary }),
};

export function registerSshRecordings(api: HuhuApi, manager: SshManager, directory: string): TerminalRecordings {
  const records = new TerminalRecordings(manager, directory, (id) => api.events.publish("entity.changed", { kind: "ssh-recording", id, op: "updated" }));
  const requireDesktop = (caller: string) => {
    if (caller !== "desktop") throw errors.permissionDenied("SSH 终端录制");
  };
  api.defineCapability(
    bindCapability(sshRecordingDescriptors.recordingsList, ({ caller }, { shellId }) => {
      requireDesktop(caller);
      return records.list(shellId);
    }),
  );
  api.defineCapability(
    bindCapability(sshRecordingDescriptors.recordingsRead, ({ caller }, { id }) => {
      requireDesktop(caller);
      return records.read(id);
    }),
  );
  api.defineCapability(
    bindCapability(sshRecordingDescriptors.recordingsStart, ({ caller, signal }, { shellId }) => {
      requireDesktop(caller);
      signal.throwIfAborted();
      return records.start(shellId);
    }),
  );
  api.defineCapability(
    bindCapability(sshRecordingDescriptors.recordingsStop, ({ caller, signal }, { shellId }) => {
      requireDesktop(caller);
      signal.throwIfAborted();
      return records.stop(shellId);
    }),
  );
  return records;
}
