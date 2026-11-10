import { errors, type CaptureFrontmatter, type EventPayload, type EventType } from "@huhu/contracts";
import type { Entity, SemanticRepository, Trash } from "@huhu/vault";

export type CaptureSource = CaptureFrontmatter["source"];
export type ConvertTarget = "task" | "note" | "archive";

export interface CaptureDto {
  id: string; path: string; version: string; title: string; body: string; source: string;
  status: "pending" | "processed" | "dismissed"; createdAt: string; processedAt: string | null;
  result: { kind: ConvertTarget; id: string } | null;
}

export interface InboxDeps {
  repo: SemanticRepository;
  trash: Trash;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  now(): Date;
  /** 调用目标插件创建对象；key 用于幂等，保证重试不会重复创建。 */
  createTarget(kind: ConvertTarget, fields: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string }>;
  isTargetEnabled(kind: ConvertTarget): boolean;
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const VALID_DESKTOP_SOURCES = new Set(["quick", "note-excerpt", "agent-cli", "import"]);

/** 调用者身份决定来源，输入里的来源字段只对桌面调用有意义（ACC-IN-05）。 */
export function sourceFor(caller: string, requested?: string): CaptureSource {
  if (caller === "desktop") return (requested && VALID_DESKTOP_SOURCES.has(requested) ? requested : "quick") as CaptureSource;
  if (caller === "cli" || caller === "mcp" || caller === "http") return caller;
  if (caller.startsWith("plugin:")) return caller as CaptureSource;
  return "quick";
}

function toDto(e: Entity): CaptureDto {
  const d = e.data as unknown as CaptureFrontmatter;
  return { id: e.id, path: e.path, version: e.version, title: d.title, body: e.body.replace(/^\r?\n/, ""), source: d.source, status: d.status, createdAt: d.createdAt, processedAt: d.processedAt ?? null, result: d.result ?? null };
}

export class InboxService {
  constructor(private readonly d: InboxDeps) {}

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

  async capture(input: { title?: string; body: string; source: CaptureSource }): Promise<CaptureDto> {
    const body = input.body.trim();
    if (!body && !input.title?.trim()) throw errors.invalidInput("内容不能为空");
    const title = input.title?.trim() || [...(body.split(/\r?\n/)[0] ?? "")].slice(0, 40).join("").trim() || "未命名捕获";
    const e = await this.d.repo.create("capture", { title, source: input.source, status: "pending", createdAt: iso(this.d.now()) }, body);
    this.d.publish("entity.changed", { kind: "capture", id: e.id, op: "created" });
    return toDto(e);
  }

  async update(id: string, expectedVersion: string, patch: { title?: string; body?: string }): Promise<CaptureDto> {
    if (patch.title !== undefined && !patch.title.trim()) throw errors.invalidInput("标题不能为空");
    const e = await this.d.repo.patch("capture", id, patch.title !== undefined ? { title: patch.title.trim() } : {}, expectedVersion, patch.body !== undefined ? `\n${patch.body}` : undefined);
    this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
    return toDto(e);
  }

  /**
   * 转换：目标插件创建对象（以捕获 id 为幂等键，崩溃后重试不会重复创建）→ 捕获置 processed。
   * 目标插件停用时拒绝。
   */
  async convert(id: string, target: ConvertTarget, fields: Record<string, unknown>): Promise<CaptureDto> {
    const cur = this.read(id);
    if (cur.status === "processed") throw errors.invalidInput("这条捕获已经处理过，请先撤销处理");
    if (!this.d.isTargetEnabled(target)) throw errors.invalidInput("请先在插件中心启用该模块");
    // 幂等键含捕获当前版本：崩溃后重试（版本未变）复用同一键；撤销处理后版本已变，会创建新对象
    const created = await this.d.createTarget(target, fields, `inbox-convert-${id}-${cur.version}`);
    const latest = this.read(id);
    const e = await this.d.repo.patch("capture", id, { status: "processed", processedAt: iso(this.d.now()), result: { kind: target, id: created.id } }, latest.version);
    this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
    return toDto(e);
  }

  private async setStatus(id: string, status: "pending" | "dismissed"): Promise<CaptureDto> {
    const cur = this.read(id);
    const e = await this.d.repo.patch("capture", id, { status, processedAt: null, result: null }, cur.version);
    this.d.publish("entity.changed", { kind: "capture", id, op: "updated" });
    return toDto(e);
  }
  dismiss(id: string): Promise<CaptureDto> {
    return this.setStatus(id, "dismissed");
  }
  restore(id: string): Promise<CaptureDto> {
    return this.setStatus(id, "pending");
  }
  /** 撤销处理：回到待处理，清空 result；已生成的内容不动。 */
  async undo(id: string): Promise<CaptureDto> {
    const cur = this.read(id);
    if (cur.status !== "processed") throw errors.invalidInput("这条捕获没有被处理过");
    return this.setStatus(id, "pending");
  }

  /** 只删除原始记录（进回收站）；转化生成的内容保留。 */
  delete(id: string): void {
    const cur = this.read(id);
    this.d.trash.moveIn(cur.path, cur.id);
    this.d.publish("entity.changed", { kind: "capture", id, op: "deleted" });
  }
}
