import { createHash, randomUUID } from "node:crypto";
import { errors, HuhuError, isWorkbenchCaller, newId, type CaptureConversion, type CaptureFrontmatter, type EventPayload, type EventType } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext } from "@huhu/kernel";
import type { Entity, SemanticRepository, Trash } from "@huhu/vault";

export type CaptureSource = CaptureFrontmatter["source"];
export type ConvertTarget = "task" | "note" | "archive";

export interface CaptureDto {
  id: string;
  path: string;
  version: string;
  title: string;
  body: string;
  source: string;
  status: "pending" | "processed" | "dismissed";
  createdAt: string;
  processedAt: string | null;
  result: { kind: ConvertTarget; id: string } | null;
  pendingConversion: ConvertTarget | null;
}

export interface InboxDeps {
  repo: SemanticRepository;
  trash: Trash;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  createTarget(kind: ConvertTarget, fields: Record<string, unknown>, conversionId: string, captureId: string, signal?: AbortSignal): Promise<void>;
  readTarget(kind: ConvertTarget, conversionId: string): string | null;
  isTargetEnabled(kind: ConvertTarget): boolean;
}

const digest = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const sourceHash = ({ title, body, source }: CaptureDto) => digest([title, body, source]);
const rejectedBeforeCreation = new Set(["INVALID_INPUT", "NOT_FOUND", "PERMISSION_DENIED", "NAME_CONFLICT", "PLUGIN_DISABLED"]);
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const VALID_DESKTOP_SOURCES = new Set(["quick", "note-excerpt", "agent-cli", "import"]);

/** 调用者身份决定来源，输入里的来源字段只对桌面调用有意义（ACC-IN-05）。 */
export function sourceFor(caller: string, requested?: string): CaptureSource {
  if (isWorkbenchCaller(caller)) return (requested && VALID_DESKTOP_SOURCES.has(requested) ? requested : "quick") as CaptureSource;
  if (caller === "cli" || caller === "mcp" || caller === "http") return caller;
  if (caller.startsWith("plugin:")) return caller as CaptureSource;
  return "quick";
}

function toDto(e: Entity): CaptureDto {
  const d = e.data as unknown as CaptureFrontmatter;
  return { id: e.id, path: e.path, version: e.version, title: d.title, body: e.body.replace(/^\r?\n/, ""), source: d.source, status: d.status, createdAt: d.createdAt, processedAt: d.processedAt ?? null, result: d.result ?? null, pendingConversion: d.status === "pending" ? d.conversion?.target ?? null : null };
}

export class InboxService {
  private readonly changes = new Map<string, Promise<unknown>>();

  constructor(private readonly d: InboxDeps) {}

  /** Serialize changes to the source, including the target creation inside a conversion. */
  async change<T>(id: string, apply: () => Promise<T> | T): Promise<T> {
    const pending = this.changes.get(id) ?? Promise.resolve();
    const writing = pending.catch(() => undefined).then(apply);
    this.changes.set(id, writing);
    try {
      return await writing;
    } finally {
      if (this.changes.get(id) === writing) this.changes.delete(id);
    }
  }

  list(q: { status?: CaptureDto["status"]; source?: string; query?: string } = {}): CaptureDto[] {
    const needle = q.query?.trim().toLowerCase();
    return this.d.repo
      .list("capture")
      .map(toDto)
      .filter((c) => !q.status || c.status === q.status)
      .filter((c) => !q.source || c.source === q.source || (q.source === "plugin" && c.source.startsWith("plugin:")))
      .filter((c) => !needle || `${c.title}\n${c.body}`.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  read(id: string): CaptureDto {
    return toDto(this.d.repo.read("capture", id));
  }

  async capture(input: { title?: string; body: string; source?: string }, context?: CapabilityContext): Promise<CaptureDto> {
    const body = input.body;
    if (!body.trim() && !input.title?.trim()) throw errors.invalidInput("内容不能为空");
    const title = input.title?.trim() || [...(body.trim().split(/\r?\n/)[0] ?? "")].slice(0, 40).join("").trim() || "未命名捕获";
    const source = context ? sourceFor(context.caller, input.source) : (input.source ?? "quick");
    const e = await this.d.repo.create("capture", { title, source, status: "pending", createdAt: iso(this.d.now()) }, `\n${body}`);
    this.d.publish("entity.changed", { kind: "capture", id: e.id, op: "created" });
    return toDto(e);
  }

  async update(id: string, expectedVersion: string, patch: { title?: string; body?: string }): Promise<CaptureDto> {
    if (patch.title !== undefined && !patch.title.trim()) throw errors.invalidInput("标题不能为空");
    const e = await this.d.repo.patch("capture", id, patch.title !== undefined ? { title: patch.title.trim() } : {}, expectedVersion, patch.body !== undefined ? `\n${patch.body}` : undefined);
    this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
    return toDto(e);
  }

  async convert(id: string, target: ConvertTarget, fields: Record<string, unknown>, options: { expectedVersion?: string | undefined; resume?: boolean | undefined; signal?: AbortSignal | undefined } = {}): Promise<CaptureDto> {
    const entity = this.d.repo.read("capture", id);
    const current = toDto(entity);
    let binding = (entity.data as unknown as CaptureFrontmatter).conversion;
    if (options.expectedVersion !== undefined && options.expectedVersion !== current.version && options.expectedVersion !== binding?.sourceVersion) {
      throw errors.versionConflict(current.version);
    }
    if (current.status === "dismissed") throw errors.invalidInput("请先恢复这条收件项");
    if (!this.d.isTargetEnabled(target)) throw errors.invalidInput("请先在插件中心启用该模块");
    const input = target === "note" ? { ...fields, body: fields["body"] ?? current.body } : fields;
    const inputHash = digest(input);
    let prepared = entity;
    if (binding) {
      if (binding.target !== target || (!options.resume && binding.inputHash !== inputHash) || binding.sourceHash !== sourceHash(current)) {
        throw this.unknownConversion(id, binding.target, "捕获或转换参数已经变化，请核实原转换");
      }
      if (current.status === "processed" && current.result) return current;
    } else {
      if (options.resume || current.status === "processed") throw errors.invalidInput("没有可继续的转换");
      if (target === "note" && typeof input["body"] !== "string") throw errors.invalidInput("笔记正文必须是 Markdown 文本");
      binding = { id: target === "task" ? newId("task") : randomUUID(), target, sourceVersion: current.version, sourceHash: sourceHash(current), inputHash };
      prepared = await this.d.repo.patch("capture", id, { conversion: binding }, current.version, undefined, () => options.signal?.throwIfAborted());
      this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
      try {
        await this.d.createTarget(target, input, binding.id, current.id, options.signal);
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code && rejectedBeforeCreation.has(code) && !this.d.readTarget(target, binding.id)) {
          await this.d.repo.patch("capture", id, { conversion: undefined }, prepared.version);
          this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
          throw error;
        }
      }
    }

    const targetId = this.d.readTarget(binding.target, binding.id);
    if (!targetId) throw this.unknownConversion(id, binding.target, "原转换的目标待核实");
    try {
      const saved = await this.d.repo.patch("capture", id, { status: "processed", processedAt: iso(this.d.now()), result: { kind: binding.target, id: targetId } }, prepared.version);
      this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
      return toDto(saved);
    } catch {
      throw this.unknownConversion(id, binding.target, "转换目标已写入，收件项回填待核实");
    }
  }

  private unknownConversion(captureId: string, target: ConvertTarget, message: string): HuhuError {
    return new HuhuError("INTERNAL", message, { retryable: false, details: { outcome: "unknown", captureId, target } });
  }

  private async setStatus(current: CaptureDto, changes: Record<string, unknown>): Promise<CaptureDto> {
    const e = await this.d.repo.patch("capture", current.id, changes, current.version);
    this.d.publish("entity.changed", { kind: "capture", id: current.id, op: "updated" });
    return toDto(e);
  }

  dismiss(id: string): Promise<CaptureDto> {
    return this.setStatus(this.read(id), { status: "dismissed" });
  }

  restore(id: string): Promise<CaptureDto> {
    const current = this.read(id);
    return this.setStatus(current, { status: current.result ? "processed" : "pending" });
  }

  /** 显式撤销允许创建新意图；旧目标保留。 */
  async undo(id: string): Promise<CaptureDto> {
    const current = this.read(id);
    if (current.status !== "processed") throw errors.invalidInput("这条捕获没有被处理过");
    return this.setStatus(current, { status: "pending", processedAt: null, result: null, conversion: undefined });
  }

  /** 只删除原始记录（进回收站）；转化生成的内容保留。 */
  async delete(id: string): Promise<void> {
    const cur = this.read(id);
    await this.d.trash.moveIn(cur.path, cur.id, { expectedVersion: cur.version });
    this.d.publish("entity.changed", { kind: "capture", id, op: "deleted" });
  }
}
