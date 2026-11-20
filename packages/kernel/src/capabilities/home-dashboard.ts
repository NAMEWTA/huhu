import { readFileSync } from "node:fs";
import { DASHBOARD_COLUMNS, DASHBOARD_SCHEMA_VERSION, DashboardBoardSchema, type DashboardBoard, type DashboardView } from "@huhu/contracts";
import { HUHU_DIR, resolveInVault, type Vault } from "@huhu/vault";

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

export function readDashboard(vault: Vault): DashboardView {
  const fallback = (source: Exclude<DashboardView["source"], "stored">): DashboardView => ({
    vaultId: vault.id,
    board: defaultBoard(),
    writable: source === "default" && !vault.readOnly,
    source,
  });
  let text: string;
  try {
    text = readFileSync(resolveInVault(vault.root, DASHBOARD_PATH), "utf8");
  } catch (error) {
    return fallback((error as NodeJS.ErrnoException).code === "ENOENT" ? "default" : "unreadable");
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fallback("invalid");
  }
  if (!hasDashboardVersion(value) || value.schemaVersion !== DASHBOARD_SCHEMA_VERSION) return fallback("unrecognized");
  const result = DashboardBoardSchema.safeParse(value);
  if (!result.success || !hasValidLayout(result.data)) return fallback("invalid");
  return { vaultId: vault.id, board: result.data, writable: !vault.readOnly, source: "stored" };
}
