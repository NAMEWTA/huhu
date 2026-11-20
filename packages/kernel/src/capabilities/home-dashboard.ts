import { isUtf8 } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_SCHEMA_VERSION,
  DashboardBoardSchema,
  DashboardRecoveryConfirmationSchema,
  DashboardRecoveryIntentSchema,
  DashboardRecoveryPreviewSchema,
  DashboardRecoveryResultSchema,
  DashboardUpdateSchema,
  DashboardViewSchema,
  defaultDashboardBoard,
  errors,
  HuhuError,
  type DashboardBoard,
  type DashboardRecoveryConfirmation,
  type DashboardRecoveryIntent,
  type DashboardUpdate,
  type DashboardView,
} from "@huhu/contracts";
import { HUHU_DIR, versionOf, type Vault } from "@huhu/vault";
import { z } from "zod";
import { defineCapability } from "./define.js";
import { placementsOverlap, planDashboardRepair, type DashboardWidgetSizeRule } from "./home-dashboard-recovery.js";

const DASHBOARD_PATH = `${HUHU_DIR}/home/widgets.json`;

function hasDashboardVersion(value: unknown): value is Record<string, unknown> & { schemaVersion: unknown } {
  return typeof value === "object" && value !== null && "schemaVersion" in value;
}

function hasValidLayout(board: DashboardBoard): boolean {
  const instances = new Set(board.instances.map((item) => item.instanceId));
  if (instances.size !== board.instances.length || instances.size !== board.layout.length) return false;

  for (const [index, item] of board.layout.entries()) {
    if (!instances.delete(item.instanceId) || item.x + item.w > DASHBOARD_COLUMNS || !Number.isSafeInteger(item.y + item.h)) return false;
    for (let previous = 0; previous < index; previous++) {
      if (placementsOverlap(item, board.layout[previous]!)) return false;
    }
  }
  return true;
}

interface DashboardSnapshot {
  view: DashboardView;
  fileVersion: string | null;
  original?: { bytes: Buffer; value: Record<string, unknown> };
}

function readDashboardSnapshot(vault: Vault): DashboardSnapshot {
  const fallback = (source: Exclude<DashboardView["source"], "stored">) => ({
    fileVersion: null,
    view: { vaultId: vault.id, board: defaultDashboardBoard(), writable: source === "default" && !vault.readOnly, source },
  });
  let bytes: Buffer;
  try {
    bytes = readFileSync(vault.files.abs(DASHBOARD_PATH));
  } catch (error) {
    return fallback((error as NodeJS.ErrnoException).code === "ENOENT" ? "default" : "unreadable");
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return fallback("invalid");
  }
  if (!hasDashboardVersion(value) || value.schemaVersion !== DASHBOARD_SCHEMA_VERSION) return fallback("unrecognized");
  const original = { bytes, value };
  const result = DashboardBoardSchema.safeParse(value);
  if (!result.success || !hasValidLayout(result.data)) return { ...fallback("invalid"), original };
  return { original, fileVersion: versionOf(bytes), view: { vaultId: vault.id, board: result.data, writable: !vault.readOnly, source: "stored" } };
}

export function readDashboard(vault: Vault): DashboardView {
  return readDashboardSnapshot(vault).view;
}

const dashboardWrites = new WeakMap<Vault, Promise<unknown>>();

function queueDashboardWrite<T>(vault: Vault, commit: () => Promise<T>): Promise<T> {
  const next = (dashboardWrites.get(vault) ?? Promise.resolve()).then(commit);
  dashboardWrites.set(
    vault,
    next.catch(() => undefined),
  );
  return next;
}

async function writeDashboard(vault: Vault, board: DashboardBoard, expectedVersion: string | null): Promise<DashboardView> {
  await vault.files.write(DASHBOARD_PATH, Buffer.from(JSON.stringify(board, null, 2) + "\n"), { expectedVersion });
  return { vaultId: vault.id, board, source: "stored", writable: true };
}

interface DashboardWidgetRule {
  readonly minSize: { readonly w: number; readonly h: number };
  readonly maxSize: { readonly w: number; readonly h: number };
  readonly maxInstances: number | null;
  readonly configSchema: z.ZodType<DashboardBoard["instances"][number]["config"]>;
}

/** 由 Engine 为每个 Vault 登记一次，使用内置 Widget 的服务端规则。 */
export function defineDashboardUpdate(vault: Vault, widgets: ReadonlyMap<string, DashboardWidgetRule>, now: () => Date, changed?: () => void) {
  async function commit(input: DashboardUpdate): Promise<DashboardView> {
    vault.assertWritable();
    const { view: current, fileVersion } = readDashboardSnapshot(vault);
    if (!current.writable) throw errors.invalidInput("无法覆盖目前的看板文件", [{ reason: current.source }]);
    if (input.baseRevision !== current.board.revision) throw errors.versionConflict(current.board.revision);
    const board: DashboardBoard = { ...current.board, revision: randomUUID(), updatedAt: now().toISOString(), instances: input.instances, layout: input.layout };
    if (!hasValidLayout(board)) throw errors.invalidInput("看板实例与几何不匹配、重叠或越界");

    const previous = new Map(current.board.instances.map((instance) => [instance.instanceId, instance]));
    const placements = new Map(board.layout.map((placement) => [placement.instanceId, placement]));
    const counts = new Map<string, number>();
    board.instances = board.instances.map((instance) => {
      const old = previous.get(instance.instanceId);
      if (old && old.widgetType !== instance.widgetType) throw errors.invalidInput("实例类型无法变更");
      const unchanged = old && isDeepStrictEqual(old.config, instance.config);
      const rule = widgets.get(instance.widgetType);
      if (!rule) {
        if (unchanged) return instance;
        throw errors.invalidInput("未知 Widget 类型或配置发生变更");
      }

      const count = (counts.get(instance.widgetType) ?? 0) + 1;
      counts.set(instance.widgetType, count);
      if (rule.maxInstances !== null && count > rule.maxInstances) throw errors.invalidInput("Widget 实例数量超过限制");
      const { w, h } = placements.get(instance.instanceId)!;
      if (w < rule.minSize.w || w > rule.maxSize.w || h < rule.minSize.h || h > rule.maxSize.h) throw errors.invalidInput("Widget 尺寸超过限制");
      const config = rule.configSchema.safeParse(instance.config);
      if (!config.success) {
        if (unchanged) return instance;
        throw errors.invalidInput("Widget 配置无效");
      }
      return { ...instance, config: config.data };
    });

    const saved = await writeDashboard(vault, board, fileVersion);
    changed?.();
    return saved;
  }

  return defineCapability({
    name: "home.dashboard.update",
    plugin: "kernel",
    scope: "write",
    exposable: false,
    defaultExposed: false,
    input: DashboardUpdateSchema,
    output: DashboardViewSchema,
    handler: (_ctx, input) => queueDashboardWrite(vault, () => commit(input)),
  });
}

function digest(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readRecoveryTarget(vault: Vault) {
  const { view, original } = readDashboardSnapshot(vault);
  if (!original && view.source !== "default") throw errors.invalidInput("无法确认可恢复的当前格式看板", [{ reason: view.source }]);
  // Refuse links and special files, including dangling links read as ENOENT.
  const entry = lstatSync(vault.files.abs(DASHBOARD_PATH), { throwIfNoEntry: false });
  if (original ? !entry?.isFile() || !isUtf8(original.bytes) : entry !== undefined) {
    throw errors.invalidInput("看板原件无法安全恢复", [{ reason: "unsafe-target" }]);
  }
  const revision = original ? (DashboardBoardSchema.shape.revision.safeParse(original.value.revision).data ?? null) : view.board.revision;
  return { source: view.source, original, revision, fileDigest: original ? digest(original.bytes) : null };
}

async function preserveDashboard(vault: Vault, original: Buffer, fileDigest: string): Promise<string> {
  const rel = `${DASHBOARD_PATH}.corrupt-${fileDigest}`;
  try {
    const entry = lstatSync(vault.files.abs(rel), { throwIfNoEntry: false });
    if (entry === undefined) await vault.files.write(rel, original, { expectedVersion: null });
    if (lstatSync(vault.files.abs(rel)).isFile() && vault.files.read(rel)?.bytes.equals(original)) return rel;
  } catch (error) {
    throw new HuhuError("INTERNAL", "无法保全损坏的看板原件", { details: { reason: "preservation-failed", code: (error as NodeJS.ErrnoException).code } });
  }
  throw new HuhuError("INTERNAL", "无法保全损坏的看板原件", { details: { reason: "preservation-failed" } });
}

export function defineDashboardRecovery(vault: Vault, widgets: ReadonlyMap<string, DashboardWidgetSizeRule>, now: () => Date, changed?: () => void) {
  const capability = { plugin: "kernel", exposable: false, defaultExposed: false } as const;

  function plan(intent: DashboardRecoveryIntent, target: ReturnType<typeof readRecoveryTarget>) {
    if (intent.action === "restore") {
      if (!hasValidLayout(intent.backup)) throw errors.invalidInput("备份的看板布局无效", [{ reason: "invalid-backup-layout" }]);
      return { board: intent.backup, changes: [] };
    }
    if (!target.original) throw errors.invalidInput("没有可修复的看板");
    const candidate = planDashboardRepair(target.original.value, widgets);
    if (candidate.changes.length === 0) throw errors.invalidInput("看板几何无需修复");
    return candidate;
  }

  function candidateDigest(intent: DashboardRecoveryIntent, candidate: ReturnType<typeof plan>): string {
    return digest(JSON.stringify({ action: intent.action, ...candidate }));
  }

  return {
    preview: defineCapability({
      ...capability,
      name: "home.dashboard.recovery.preview",
      scope: "read",
      input: DashboardRecoveryIntentSchema,
      output: DashboardRecoveryPreviewSchema,
      handler: (_ctx, intent) => {
        const target = readRecoveryTarget(vault);
        const candidate = plan(intent, target);
        const confirmation = { vaultId: vault.id, revision: target.revision, fileDigest: target.fileDigest, candidateDigest: candidateDigest(intent, candidate) };
        return { ...candidate, confirmation, writable: !vault.readOnly };
      },
    }),
    commit: defineCapability({
      ...capability,
      name: "home.dashboard.recovery.commit",
      scope: "write",
      input: z.strictObject({ intent: DashboardRecoveryIntentSchema, confirmation: DashboardRecoveryConfirmationSchema }),
      output: DashboardRecoveryResultSchema,
      handler: (_ctx, { intent, confirmation }: { intent: DashboardRecoveryIntent; confirmation: DashboardRecoveryConfirmation }) =>
        queueDashboardWrite(vault, async () => {
          vault.assertWritable();
          if (confirmation.vaultId !== vault.id) throw errors.invalidInput("恢复预览属于另一个 Vault", [{ reason: "wrong-vault" }]);
          const target = readRecoveryTarget(vault);
          if (confirmation.revision !== target.revision || confirmation.fileDigest !== target.fileDigest) throw errors.versionConflict(target.revision ?? target.fileDigest ?? "0");
          const candidate = plan(intent, target);
          if (confirmation.candidateDigest !== candidateDigest(intent, candidate)) throw errors.invalidInput("恢复内容已改变，请重新预览", [{ reason: "changed-candidate" }]);

          const board = { ...candidate.board, revision: randomUUID(), updatedAt: now().toISOString() };
          const preservedPath = target.original && target.fileDigest && (target.source === "invalid" || intent.action === "repair") ? await preserveDashboard(vault, target.original.bytes, target.fileDigest) : null;
          const view = await writeDashboard(vault, board, target.original ? versionOf(target.original.bytes) : null);
          changed?.();
          return { view, preservedPath };
        }),
    }),
  };
}
