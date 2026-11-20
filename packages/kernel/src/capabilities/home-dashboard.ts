import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { DASHBOARD_COLUMNS, DASHBOARD_SCHEMA_VERSION, DashboardBoardSchema, DashboardUpdateSchema, DashboardViewSchema, errors, type DashboardBoard, type DashboardUpdate, type DashboardView } from "@huhu/contracts";
import { HUHU_DIR, versionOf, type Vault } from "@huhu/vault";
import type { z } from "zod";
import { defineCapability } from "./define.js";

const DASHBOARD_PATH = `${HUHU_DIR}/home/widgets.json`;

function defaultBoard(): DashboardBoard {
  return {
    schemaVersion: DASHBOARD_SCHEMA_VERSION,
    boardId: "home",
    revision: "0",
    updatedAt: null,
    instances: [{ instanceId: "default-focus", widgetType: "widget:kernel:focus", config: {}, hidden: false }],
    layout: [{ instanceId: "default-focus", x: 0, y: 0, w: 3, h: 2 }],
  };
}

export function hasDashboardVersion(value: unknown): value is { schemaVersion: unknown } {
  return typeof value === "object" && value !== null && "schemaVersion" in value;
}

function hasValidLayout(board: DashboardBoard): boolean {
  const instances = new Set(board.instances.map((item) => item.instanceId));
  if (instances.size !== board.instances.length || instances.size !== board.layout.length) return false;

  for (const [index, item] of board.layout.entries()) {
    if (!instances.delete(item.instanceId) || item.x + item.w > DASHBOARD_COLUMNS || !Number.isSafeInteger(item.y + item.h)) return false;
    for (let previous = 0; previous < index; previous++) {
      const other = board.layout[previous]!;
      if (item.x < other.x + other.w && other.x < item.x + item.w && item.y < other.y + other.h && other.y < item.y + item.h) return false;
    }
  }
  return true;
}

function readDashboardSnapshot(vault: Vault): { view: DashboardView; fileVersion: string | null } {
  const fallback = (source: Exclude<DashboardView["source"], "stored">) => ({
    fileVersion: null,
    view: { vaultId: vault.id, board: defaultBoard(), writable: source === "default" && !vault.readOnly, source },
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
  const result = DashboardBoardSchema.safeParse(value);
  if (!result.success || !hasValidLayout(result.data)) return fallback("invalid");
  return { fileVersion: versionOf(bytes), view: { vaultId: vault.id, board: result.data, writable: !vault.readOnly, source: "stored" } };
}

export function readDashboard(vault: Vault): DashboardView {
  return readDashboardSnapshot(vault).view;
}

interface DashboardWidgetRule {
  readonly minSize: { readonly w: number; readonly h: number };
  readonly maxSize: { readonly w: number; readonly h: number };
  readonly maxInstances: number | null;
  readonly configSchema: z.ZodType<DashboardBoard["instances"][number]["config"]>;
}

/** 由 W06 为每个 Vault 登记一次，使用内置 Widget 的服务端规则。 */
export function defineDashboardUpdate(vault: Vault, widgets: ReadonlyMap<string, DashboardWidgetRule>, now: () => Date) {
  let written: Promise<unknown> = Promise.resolve();

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

    await vault.files.write(DASHBOARD_PATH, Buffer.from(JSON.stringify(board, null, 2) + "\n"), { expectedVersion: fileVersion });
    return { vaultId: vault.id, board, source: "stored", writable: true };
  }

  return defineCapability({
    name: "home.dashboard.update",
    plugin: "kernel",
    scope: "write",
    exposable: false,
    defaultExposed: false,
    input: DashboardUpdateSchema,
    output: DashboardViewSchema,
    handler: (_ctx, input) => {
      const next = written.then(() => commit(input));
      written = next.catch(() => undefined);
      return next;
    },
  });
}
