import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import type { z } from "zod";
import { groupsInScope, hostSearchTerms, matchesHostSearch } from "../shared/host-directory.js";
import { DirectoryState, type DirectoryQuery, type DirectoryUpdate, type DirectoryView } from "./directory-schema.js";
import type { HostRecord } from "./host-configurations.js";

type State = z.infer<typeof DirectoryState>;
type Group = State["groups"][number];
type Placement = State["placements"][number];
type Query = z.infer<typeof DirectoryQuery>;
type Update = z.infer<typeof DirectoryUpdate>;
type View = z.infer<typeof DirectoryView>;
type ImportScope = { version: string; groups: Group[]; assertCurrent(): void };

const DIRECTORY_FILE = ".huhu/ssh/host-directory.json";
const INITIAL_VERSION = "0";

function visibleGroups(state: State, knownHosts: ReadonlySet<string>): Group[] {
  const groupById = new Map(state.groups.map((group) => [group.groupId, group]));
  const visible = new Set<string>();
  for (const { hostId, groupId } of state.placements) {
    if (!knownHosts.has(hostId)) continue;
    for (let id = groupId; id && !visible.has(id); id = groupById.get(id)!.parentId) visible.add(id);
  }
  return state.groups.filter(({ groupId }) => visible.has(groupId));
}

function validateGroupTree(groups: ReadonlyMap<string, Group>) {
  const checked = new Set<string>();
  for (const groupId of groups.keys()) {
    const parents = new Set<string>();
    let current: string | null = groupId;
    while (current !== null && !checked.has(current)) {
      const group = groups.get(current);
      if (!group) throw errors.invalidInput("父分组不存在");
      if (parents.has(current)) throw errors.invalidInput("分组不能形成循环");
      parents.add(current);
      current = group.parentId;
    }
    for (const parent of parents) checked.add(parent);
  }
}

function compareHosts(a: HostRecord, b: HostRecord): number {
  return a.name.localeCompare(b.name) || a.user.localeCompare(b.user) || a.host.localeCompare(b.host) || a.port - b.port || a.id.localeCompare(b.id);
}

function projectDirectory(state: State, hosts: HostRecord[], query: Query): View {
  const placements = new Map(state.placements.map((placement) => [placement.hostId, placement]));
  const ranks = new Map(state.manualOrder.map((id, index) => [id, index]));
  const words = hostSearchTerms(query.query ?? "");
  const groupId = query.groupId;
  if (typeof groupId === "string" && !state.groups.some((group) => group.groupId === groupId)) throw errors.notFound("分组不存在");
  const scope = typeof groupId === "string" ? groupsInScope(state.groups, groupId) : null;

  const rows = hosts
    .filter((host) => {
      const group = placements.get(host.id)?.groupId ?? null;
      if (scope ? group === null || !scope.has(group) : groupId === null && group !== null) return false;
      return matchesHostSearch(host, words);
    })
    .sort((a, b) => {
      const pinned = Number(placements.get(b.id)?.pinned ?? false) - Number(placements.get(a.id)?.pinned ?? false);
      if (pinned) return pinned;
      if (state.sort === "manual") {
        const rank = (ranks.get(a.id) ?? state.manualOrder.length) - (ranks.get(b.id) ?? state.manualOrder.length);
        if (rank) return rank;
      }
      return state.sort === "name-desc" ? compareHosts(b, a) : compareHosts(a, b);
    })
    .map(({ id, name, host, port, user, tags }) => ({
      hostId: id,
      name,
      host,
      port,
      user,
      tags: tags ?? [],
      groupId: placements.get(id)?.groupId ?? null,
      pinned: placements.get(id)?.pinned ?? false,
    }));

  return {
    version: state.version,
    sort: state.sort,
    groups: [...state.groups].sort((a, b) => a.name.localeCompare(b.name) || a.groupId.localeCompare(b.groupId)),
    hosts: rows,
  };
}

function applyOperation(state: State, hosts: HostRecord[], operation: Update["operation"]): State {
  const liveHostIds = new Set(hosts.map((host) => host.id));
  const groups = new Map(state.groups.map((group) => [group.groupId, group]));
  // Only live HostStore records occupy a group.
  const placements = new Map(state.placements.filter((placement) => liveHostIds.has(placement.hostId)).map((placement) => [placement.hostId, placement]));
  let manualOrder = state.manualOrder.filter((id) => liveHostIds.has(id));
  let sort = state.sort;

  function requireGroup(groupId: string): Group {
    const group = groups.get(groupId);
    if (!group) throw errors.notFound("分组不存在");
    return group;
  }

  switch (operation.type) {
    case "group.create": {
      const groupId = randomUUID();
      groups.set(groupId, { groupId, parentId: operation.parentId, name: operation.name });
      break;
    }
    case "group.rename": {
      const group = requireGroup(operation.groupId);
      groups.set(group.groupId, { ...group, name: operation.name });
      break;
    }
    case "group.move": {
      const group = requireGroup(operation.groupId);
      groups.set(group.groupId, { ...group, parentId: operation.parentId });
      break;
    }
    case "group.delete": {
      requireGroup(operation.groupId);
      if ([...groups.values()].some((group) => group.parentId === operation.groupId) || [...placements.values()].some((placement) => placement.groupId === operation.groupId)) {
        throw errors.invalidInput("请先移出分组中的主机和子组");
      }
      groups.delete(operation.groupId);
      break;
    }
    case "hosts.move":
    case "hosts.pin": {
      if (operation.type === "hosts.move" && operation.groupId !== null) requireGroup(operation.groupId);
      for (const hostId of new Set(operation.hostIds)) {
        if (!liveHostIds.has(hostId)) throw errors.notFound("主机不存在");
        const previous: Placement = placements.get(hostId) ?? { hostId, groupId: null, pinned: false };
        const next = operation.type === "hosts.move" ? { ...previous, groupId: operation.groupId } : { ...previous, pinned: operation.pinned };
        if (next.groupId === null && !next.pinned) placements.delete(hostId);
        else placements.set(hostId, next);
      }
      break;
    }
    case "hosts.reorder": {
      if (operation.groupId !== null) requireGroup(operation.groupId);
      const inGroup = hosts.filter((host) => (placements.get(host.id)?.groupId ?? null) === operation.groupId);
      const orderedIds = new Set(operation.hostIds);
      if (operation.hostIds.length !== inGroup.length || orderedIds.size !== inGroup.length || inGroup.some((host) => !orderedIds.has(host.id))) {
        throw errors.invalidInput("排序须包含该组的全部直属主机，每台各一次");
      }
      const rankedHosts = new Set(manualOrder);
      const unranked = [...hosts]
        .sort(compareHosts)
        .map((host) => host.id)
        .filter((id) => !rankedHosts.has(id));
      const order = operation.hostIds.values();
      manualOrder = [...manualOrder, ...unranked].map((id) => (orderedIds.has(id) ? order.next().value! : id));
      break;
    }
    case "sort.set":
      sort = operation.sort;
      break;
  }

  validateGroupTree(groups);
  return { ...state, version: randomUUID(), groups: [...groups.values()], placements: [...placements.values()], manualOrder, sort };
}

export class HostDirectory {
  constructor(
    private readonly hosts: { list(): HostRecord[] | Promise<HostRecord[]> },
    private readonly files: HuhuApi["vault"]["files"],
  ) {}

  private readState(): { state: State; fileVersion: string | null } {
    const file = this.files.read(DIRECTORY_FILE);
    if (!file) {
      if (this.files.exists(DIRECTORY_FILE)) throw errors.invalidInput("主机目录路径上应是普通文件");
      return { state: { schemaVersion: 1, version: INITIAL_VERSION, sort: "name-asc", groups: [], placements: [], manualOrder: [] }, fileVersion: null };
    }
    let value: unknown;
    try {
      value = JSON.parse(file.bytes.toString("utf8"));
    } catch {
      throw errors.invalidInput("主机目录文件不是有效 JSON");
    }
    const parsed = DirectoryState.safeParse(value);
    if (!parsed.success) throw errors.invalidInput("主机目录文件格式无效");
    const state = parsed.data;
    const groups = new Map(state.groups.map((group) => [group.groupId, group]));
    if (
      state.version === INITIAL_VERSION ||
      groups.size !== state.groups.length ||
      new Set(state.placements.map((placement) => placement.hostId)).size !== state.placements.length ||
      new Set(state.manualOrder).size !== state.manualOrder.length ||
      state.placements.some((placement) => placement.groupId !== null && !groups.has(placement.groupId))
    )
      throw errors.invalidInput("主机目录文件包含无效的分组或主机排列");
    validateGroupTree(groups);
    return { state, fileVersion: file.version };
  }

  async list(query: Query, visibleHosts?: HostRecord[]): Promise<View> {
    const { state } = this.readState();
    if (!visibleHosts) return projectDirectory(state, await this.hosts.list(), query);
    const groups = visibleGroups(state, new Set(visibleHosts.map(({ id }) => id)));
    return projectDirectory({ ...state, groups }, visibleHosts, query);
  }

  async organize({ expectedVersion, operation }: Update, scope?: { visible(): ReadonlySet<string>; assertCurrent(): void }): Promise<View> {
    this.files.assertWritable();
    const { state, fileVersion } = this.readState();
    if (state.version !== expectedVersion) throw errors.versionConflict(state.version);
    const hosts = await this.hosts.list();
    if (scope) {
      scope.assertCurrent();
      if (!("hostIds" in operation)) throw errors.permissionDenied("SSH 全库目录操作");
      if ("groupId" in operation && operation.groupId !== null && !visibleGroups(state, scope.visible()).some(({ groupId }) => groupId === operation.groupId)) {
        throw errors.notFound("SSH 分组不存在");
      }
    }
    const next = applyOperation(state, hosts, operation);
    const view = projectDirectory(next, hosts, {});
    try {
      await this.files.write(DIRECTORY_FILE, Buffer.from(JSON.stringify(next, null, 2) + "\n"), { expectedVersion: fileVersion });
    } catch (error) {
      // The first writer races on file creation. Expose the same conflict as later writes.
      if (error instanceof HuhuError && ["NAME_CONFLICT", "VERSION_CONFLICT", "NOT_FOUND"].includes(error.code)) {
        throw errors.versionConflict(this.readState().state.version);
      }
      throw error;
    }
    return view;
  }

  importScope(visible: ReadonlySet<string>): ImportScope {
    const { state } = this.readState();
    return {
      version: state.version,
      groups: visibleGroups(state, visible),
      assertCurrent: () => {
        if (this.readState().state.version !== state.version) throw errors.invalidInput("SSH 导入预览已失效，请重新预览");
      },
    };
  }

  async placeImported(rows: readonly { hostId: string; group: readonly string[] }[], signal: AbortSignal, scope?: ImportScope, assertCurrent?: () => void): Promise<boolean> {
    const placementsToAdd = rows.filter(({ group }) => group.length);
    if (!placementsToAdd.length) return false;
    this.files.assertWritable();
    const liveHosts = new Set((await this.hosts.list()).map(({ id }) => id));
    if (placementsToAdd.some(({ hostId }) => !liveHosts.has(hostId))) throw errors.notFound("部分导入主机已移除，请重新预览");
    const { state, fileVersion } = this.readState();
    scope?.assertCurrent();
    const next = { ...state, groups: [...state.groups], placements: [...state.placements] };
    for (const row of placementsToAdd) {
      if (next.placements.some(({ hostId }) => hostId === row.hostId)) continue;
      let parentId: string | null = null;
      for (const name of row.group) {
        const matches = (scope?.groups ?? next.groups).filter((group) => group.parentId === parentId && group.name.toLowerCase() === name.toLowerCase());
        if (scope && matches.length !== 1) {
          parentId = null;
          break;
        }
        if (matches.length > 1) throw errors.invalidInput("目标分组有重名，请先校正分组目录");
        const group: Group = matches[0] ?? { groupId: randomUUID(), parentId, name };
        if (!matches.length) next.groups.push(group);
        parentId = group.groupId;
      }
      if (parentId !== null) next.placements.push({ hostId: row.hostId, groupId: parentId, pinned: false });
    }
    if (next.placements.length === state.placements.length) return false;
    signal.throwIfAborted();
    assertCurrent?.();
    next.version = randomUUID();
    await this.files.write(DIRECTORY_FILE, Buffer.from(JSON.stringify(next, null, 2) + "\n"), { expectedVersion: fileVersion });
    return true;
  }
}
