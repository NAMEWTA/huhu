import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { stripVTControlCharacters } from "node:util";
import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { RecordingContent, RecordingSummary } from "../shared/recordings.js";
import type { SshManager } from "./manager.js";

const bytesPerRecording = 256 * 1024;
const maxFileSize = 7 * bytesPerRecording;
const maxActive = 8;
const maxSaved = 60;
const recordingFile = /^([a-f0-9-]{36})\.json$/u;

type Active = { summary: RecordingSummary; bytes: number; buffers: Buffer[]; detach(): void };

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
    if (this.active.has(shellId)) return { ...this.active.get(shellId)!.summary };
    if (this.active.size >= maxActive) throw errors.invalidInput("最多同时录制 8 个 Shell");
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const summary: RecordingSummary = { id: randomUUID(), shellId, hostId: shell.hostId, label: shell.name, startedAt: new Date().toISOString(), endedAt: null, truncated: false, reason: null };
    const active: Active = { summary, bytes: 0, buffers: [], detach: () => {} };
    const view = this.manager.attachShell(
      shellId,
      {
        onData: (bytes) => {
          const remaining = bytesPerRecording - active.bytes;
          if (remaining > 0) {
            const captured = bytes.subarray(0, remaining);
            active.buffers.push(Buffer.from(captured));
            active.bytes += captured.length;
          }
          if (bytes.length > remaining) summary.truncated = true;
        },
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
    const ongoing = [...this.active.values()].map(({ summary }) => ({ ...summary }));
    const disk = this.saved().flatMap((id) => {
      const content = this.readSaved(id);
      return content ? [content.summary] : [];
    });
    return [...ongoing, ...disk].filter((item) => !shellId || item.shellId === shellId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  read(id: string): RecordingContent {
    const own = [...this.active.values()].find(({ summary }) => summary.id === id);
    const value = own ? this.content(own) : this.readSaved(id);
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
    active.detach();
    active.summary.endedAt ??= new Date().toISOString();
    active.summary.reason ??= reason;
    const content = this.content(active);
    const file = path.join(this.directory, content.summary.id + ".json");
    const temporary = file + ".tmp";
    try {
      writeFileSync(temporary, JSON.stringify(content), { mode: 0o600, flag: "wx", flush: true });
      renameSync(temporary, file);
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

  private content({ summary, buffers }: Active): RecordingContent {
    const decoder = new StringDecoder("utf8");
    const decoded = decoder.write(Buffer.concat(buffers));
    const text = stripVTControlCharacters(decoded + (summary.truncated ? "" : decoder.end()));
    return { summary: { ...summary }, text };
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

  private readSaved(id: string): RecordingContent | undefined {
    if (!RecordingSummary.shape.id.safeParse(id).success) return undefined;
    const file = path.join(this.directory, id + ".json");
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat?.isFile() || stat.size > maxFileSize) return undefined;
    try {
      const saved = RecordingContent.parse(JSON.parse(readFileSync(file, "utf8")));
      return saved.summary.id === id ? saved : undefined;
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
