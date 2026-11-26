import { Badge, Button, Dialog, EmptyState, Field, PageHead, Popover, SearchBox, Segmented, Select } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { Server } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { z } from "zod";
import type { DirectoryUpdate, DirectoryView } from "../engine/directory-schema.js";
import { maxRouteEditTargets } from "../shared/route.js";
import { directoryGroupPath, groupsInScope, hostSearchTerms, matchesHostSearch } from "../shared/host-directory.js";
import { MAX_WORKSPACE_PANES } from "../shared/workspace.js";
import type { ConnectionStatus } from "../shared/trust.js";
import { hostEndpoint } from "./HostKeyDialog.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";

type Directory = z.output<typeof DirectoryView>;
type Operation = z.input<typeof DirectoryUpdate>["operation"];
type DirectoryEntry = Directory["hosts"][number];
type DirectoryDialog = { kind: "create-group"; version: string } |
  { kind: "move-hosts"; version: string; ids: string[] } |
  { kind: "rename-group" | "move-group" | "delete-group"; version: string; groupId: string };
const sortModes = {
  "name-asc": "名称升序",
  "name-desc": "名称降序",
  manual: "手动排序",
} satisfies Record<Directory["sort"], string>;
const dialogTitle: Record<DirectoryDialog["kind"], string> = {
  "create-group": "新建主机分组",
  "move-hosts": "移动所选主机",
  "rename-group": "重命名主机分组",
  "move-group": "移动主机分组",
  "delete-group": "删除主机分组",
};

export function HostDirectory({ directory, hosts, statuses, onBack, onOpen, onConnect, onFiles, onWorkspace, onRoute, onCreate, onImport, onHostAction, onQuickConnect, onChanged }: {
  directory: Directory | undefined;
  hosts: Host[];
  statuses: ReadonlyMap<string, ConnectionStatus>;
  onBack(): void;
  onOpen(host: Host): void;
  onConnect(host: Host): void;
  onFiles(host: Host): void;
  onWorkspace(ids: string[], temporary: boolean): void;
  onRoute?: ((ids: string[]) => void) | undefined;
  onCreate?: (() => void) | undefined;
  onImport?: (() => void) | undefined;
  onQuickConnect?: ((endpoint: string) => void) | undefined;
  onHostAction?: ((kind: "edit" | "copy" | "remove", host: ManagedHost) => void) | undefined;
  onChanged(): Promise<unknown>;
}) {
  const engine = useEngine();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DirectoryDialog>();
  const [menuHostId, setMenuHostId] = useState<string>();
  const [removing, setRemoving] = useState<ManagedHost[]>();
  const dragging = useRef<{ entry: DirectoryEntry; version: string }>(undefined);
  const working = useRef(false);
  const [groupName, setGroupName] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formId = useId();
  const groups = directory?.groups ?? [];
  const groupById = new Map(groups.map((item) => [item.groupId, item]));
  const hostById = new Map(hosts.map((host) => [host.id, host]));
  const terms = hostSearchTerms(query);
  const scope = group && group !== "all" && groupById.has(group) ? groupsInScope(groups, group) : null;
  const currentGroup = groupById.get(group);
  const entries = (directory?.hosts ?? []).filter((entry) => hostById.has(entry.hostId));
  const visible = entries.filter((entry) => {
    if (!matchesHostSearch(entry, terms)) return false;
    if (group === "") return entry.groupId === null;
    return !scope || (entry.groupId !== null && scope.has(entry.groupId));
  });
  const selected = entries.filter(({ hostId }) => checked.has(hostId)).map(({ hostId }) => hostId);
  const selectedPinned = selected.length > 0 && entries.filter(({ hostId }) => checked.has(hostId)).every(({ pinned }) => pinned);
  const visibleIds = new Set(visible.map(({ hostId }) => hostId));
  const hiddenSelected = selected.filter((hostId) => !visibleIds.has(hostId)).length;
  const selectedManaged = selected.length > 0 && selected.every((hostId) => isManagedHost(hostById.get(hostId)!));
  const canStart = selectedManaged && selected.length <= MAX_WORKSPACE_PANES;
  const canReorder = directory?.sort === "manual" && terms.length === 0 && !busy;
  const managedGroup = dialog && "groupId" in dialog ? groupById.get(dialog.groupId) : undefined;
  const groupNameField = dialog?.kind === "create-group" || dialog?.kind === "rename-group";
  const destinationField = dialog?.kind === "create-group" || dialog?.kind === "move-group" || dialog?.kind === "move-hosts";
  const destinationLabel = dialog?.kind === "move-hosts" ? "目标分组" : "父分组";

  function toggle(id: string, active: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function open(kind: DirectoryDialog["kind"], ids = selected) {
    if (!directory) return;
    setError("");
    setGroupName(kind === "rename-group" ? currentGroup?.name ?? "" : "");
    setDestination(kind === "create-group" ? currentGroup?.groupId ?? "" : kind === "move-group" ? currentGroup?.parentId ?? "" : "");
    if (kind === "move-hosts") {
      setDialog({ kind, version: directory.version, ids });
    } else if (kind === "create-group") {
      setDialog({ kind, version: directory.version });
    } else if (currentGroup) {
      setDialog({ kind, version: directory.version, groupId: currentGroup.groupId });
    }
  }

  async function organize(operation: Operation, expectedVersion = directory?.version) {
    if (!expectedVersion || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await engine.call("ssh.hosts.organize", { expectedVersion, operation }, { write: true });
      setDialog(undefined);
      if (operation.type === "group.delete") setGroup("all");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  function groupOptions(excluded?: ReadonlySet<string>) {
    return groups.filter(({ groupId }) => !excluded?.has(groupId)).map(({ groupId }) => <option key={groupId} value={groupId}>{directoryGroupPath(groupById, groupId)}</option>);
  }

  function submit() {
    if (!dialog) return;
    const parentId = destination || null;
    const name = groupName.trim();
    switch (dialog.kind) {
      case "create-group": return organize({ type: "group.create", parentId, name }, dialog.version);
      case "rename-group": return organize({ type: "group.rename", groupId: dialog.groupId, name }, dialog.version);
      case "move-group": return organize({ type: "group.move", groupId: dialog.groupId, parentId }, dialog.version);
      case "delete-group": return organize({ type: "group.delete", groupId: dialog.groupId }, dialog.version);
      case "move-hosts": return organize({ type: "hosts.move", hostIds: dialog.ids, groupId: parentId }, dialog.version);
    }
  }

  function reorder(from: DirectoryEntry, to: DirectoryEntry, expectedVersion: string) {
    if (!canReorder || from.groupId !== to.groupId || from.pinned !== to.pinned || from.hostId === to.hostId || !directory) return;
    const ids = directory.hosts.filter(({ groupId }) => groupId === from.groupId).map(({ hostId }) => hostId);
    const toIndex = ids.indexOf(to.hostId);
    const fromIndex = ids.indexOf(from.hostId);
    if (toIndex < 0 || fromIndex < 0) return;
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, from.hostId);
    void organize({ type: "hosts.reorder", groupId: from.groupId, hostIds: ids }, expectedVersion);
  }

  function confirmRemoval(ids: string[]) {
    setError("");
    setRemoving(ids.map((id) => hostById.get(id)).filter((host): host is ManagedHost => !!host && isManagedHost(host)));
  }

  async function removeHosts() {
    if (!removing || working.current) return;
    working.current = true;
    setBusy(true);
    const removed = new Set<string>();
    const errors: string[] = [];
    try {
      for (const host of removing) {
        try {
          await engine.call("ssh.hosts.remove", { hostId: host.id, expectedRevision: host.revision }, { write: true });
          removed.add(host.id);
        } catch (cause) {
          errors.push(`${host.name}：${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      setChecked((current) => new Set([...current].filter((id) => !removed.has(id))));
      setRemoving(undefined);
      setError(errors.length ? `已删除 ${removed.size} 台。请核对其余主机：${errors.join("；")}` : "");
      await onChanged();
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="hu-view-content" aria-label="SSH 主机目录">
      <PageHead title="主机目录" actions={<>
        <Button onClick={onBack}>返回主机详情</Button>
        {onImport ? <Button onClick={onImport}>导入主机</Button> : null}
        {onCreate ? <Button variant="primary" onClick={onCreate}>新建主机</Button> : null}
      </>} />
      <div className="ssh-directory-controls row">
        <SearchBox value={query} onChange={setQuery} placeholder="搜索主机名称、地址、用户或标签…" />
        {onQuickConnect ? <Button onClick={() => onQuickConnect(query)}>快速连接</Button> : null}
        <Select aria-label="按主机分组筛选" value={scope || group === "" ? group : "all"} onChange={(event) => setGroup(event.target.value)}>
          <option value="all">全部分组</option>
          <option value="">未分组</option>
          {groupOptions()}
        </Select>
        <Select aria-label="主机排序" value={directory?.sort ?? "name-asc"} disabled={!directory || busy} onChange={(event) => void organize({ type: "sort.set", sort: event.currentTarget.value as Directory["sort"] })}>
          {Object.entries(sortModes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select>
        <Segmented<"list" | "grid"> label="主机视图" value={layout} onChange={setLayout} options={[{ value: "list", label: "列表" }, { value: "grid", label: "网格" }]} />
      </div>
      <div className="ssh-directory-controls row">
        <span role="status">已选 {selected.length} 台{hiddenSelected ? `（其中 ${hiddenSelected} 台在筛选结果之外）` : ""}</span>
        <Button disabled={!directory} onClick={() => open("create-group")}>新建分组</Button>
        {currentGroup ? (
          <>
            <Button onClick={() => open("rename-group")}>重命名分组</Button>
            <Button onClick={() => open("move-group")}>移动分组</Button>
            <Button onClick={() => open("delete-group")}>删除分组</Button>
          </>
        ) : null}
        <Button disabled={!selected.length || busy} onClick={() => open("move-hosts")}>移动所选</Button>
        <Button disabled={!selected.length || busy} onClick={() => void organize({ type: "hosts.pin", hostIds: selected, pinned: !selectedPinned })}>
          {selectedPinned ? "取消置顶所选" : "置顶所选"}
        </Button>
        <Button disabled={!canStart} onClick={() => onWorkspace(selected, true)}>连接所选</Button>
        <Button disabled={!canStart} onClick={() => onWorkspace(selected, false)}>从选择建立工作区</Button>
        {onRoute ? <Button disabled={!selectedManaged || selected.length > maxRouteEditTargets} onClick={() => onRoute(selected)}>为所选关联跳板</Button> : null}
        {onHostAction ? <Button disabled={!selectedManaged || busy} onClick={() => confirmRemoval(selected)}>删除所选</Button> : null}
      </div>
      {error && !dialog && !removing ? <p role="alert">{error}</p> : null}
      {visible.length ? (
        <ul className="ssh-directory-hosts" data-layout={layout} role="list" aria-label="主机">
          {visible.map((entry) => {
            const host = hostById.get(entry.hostId)!;
            const state = statuses.get(host.id)?.state;
            const reconnect = statuses.get(host.id)?.reconnect;
            const openConnection = Boolean(reconnect) || state === "connected" || state === "connecting" || state === "waiting" || state === "auth-waiting" || state === "key-changed";
            const menuIds = checked.has(host.id) ? selected : [host.id];
            const menuManaged = menuIds.every((id) => isManagedHost(hostById.get(id)!));
            const one = menuIds.length === 1;
            const pin = entries.some(({ hostId, pinned }) => menuIds.includes(hostId) && !pinned);
            const neighbors = canReorder ? visible.filter((candidate) => candidate.groupId === entry.groupId && candidate.pinned === entry.pinned) : [];
            const index = neighbors.indexOf(entry);
            const menuAction = (action: () => void) => () => { setMenuHostId(undefined); action(); };
            return (
              <li key={host.id} className="ssh-directory-host"
                onContextMenu={(event) => { event.preventDefault(); setMenuHostId(host.id); }}
                onDragOver={(event) => {
                  const from = dragging.current?.entry;
                  if (canReorder && from && from.groupId === entry.groupId && from.pinned === entry.pinned && from.hostId !== entry.hostId) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  const from = dragging.current;
                  if (!from || !event.dataTransfer.types.includes("application/x-huhu-ssh-host")) return;
                  event.preventDefault();
                  dragging.current = undefined;
                  reorder(from.entry, entry, from.version);
                }}
              >
                <div className="row">
                  <input type="checkbox" aria-label={`选择 ${host.name}`} checked={checked.has(host.id)} onChange={(event) => toggle(host.id, event.target.checked)} />
                  <strong>{host.name}</strong>
                  {entry.pinned ? <Badge>已置顶</Badge> : null}
                  {openConnection ? <Badge>{state === "connected" ? "已连接" : reconnect ? "自动重连" : "连接待处理"}</Badge> : null}
                </div>
                <code>{host.user}@{hostEndpoint(host)}</code>
                <div className="row">
                  <span>{directoryGroupPath(groupById, entry.groupId) || "未分组"}</span>
                  {entry.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                </div>
                <div className="row">
                  <Button variant="ghost" aria-label={`打开主机详情 ${host.name}`} onClick={() => onOpen(host)}>详情</Button>
                  {!openConnection && isManagedHost(host) ? <Button variant="ghost" aria-label={`连接 ${host.name}`} onClick={() => onConnect(host)}>连接</Button> : null}
                  {neighbors.length > 1 && directory ? (
                    <Button variant="ghost" draggable aria-label={`拖动 ${host.name}`}
                      onDragStart={(event) => {
                        dragging.current = { entry, version: directory.version };
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-huhu-ssh-host", entry.hostId);
                      }}
                      onDragEnd={() => { dragging.current = undefined; }}
                    >拖动排序</Button>
                  ) : null}
                  <Popover.Root open={menuHostId === host.id} onOpenChange={(shown) => setMenuHostId((current) => shown ? host.id : current === host.id ? undefined : current)}>
                    <Popover.Trigger asChild><Button variant="ghost" aria-label={`更多操作 ${host.name}`}>更多操作</Button></Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="ssh-directory-actions" align="end" sideOffset={4} collisionPadding={8} aria-label={`${host.name}的操作`}>
                        <Button variant="ghost" disabled={!one} onClick={menuAction(() => onOpen(host))}>详情</Button>
                        <Button variant="ghost" disabled={!one || !isManagedHost(host)} onClick={menuAction(() => onFiles(host))}>打开独立文件管理</Button>
                        <Button variant="ghost" disabled={!menuManaged || menuIds.length > MAX_WORKSPACE_PANES || one && openConnection} onClick={menuAction(() => one ? onConnect(host) : onWorkspace(menuIds, true))}>连接</Button>
                        <Button variant="ghost" disabled={busy} onClick={menuAction(() => open("move-hosts", menuIds))}>移动分组</Button>
                        <Button variant="ghost" disabled={busy} onClick={menuAction(() => { void organize({ type: "hosts.pin", hostIds: menuIds, pinned: pin }); })}>
                          {pin ? "置顶" : "取消置顶"}
                        </Button>
                        <Button variant="ghost" disabled={!menuManaged || menuIds.length > MAX_WORKSPACE_PANES} onClick={menuAction(() => onWorkspace(menuIds, false))}>建立工作区</Button>
                        {onRoute && <Button variant="ghost" disabled={!menuManaged || menuIds.length > maxRouteEditTargets} onClick={menuAction(() => onRoute(menuIds))}>关联跳板</Button>}
                        {directory && neighbors.length > 1 && <>
                          <Button variant="ghost" disabled={!one || index < 1} onClick={menuAction(() => reorder(entry, neighbors[index - 1]!, directory.version))}>上移</Button>
                          <Button variant="ghost" disabled={!one || index === neighbors.length - 1} onClick={menuAction(() => reorder(entry, neighbors[index + 1]!, directory.version))}>下移</Button>
                        </>}
                        {onHostAction && isManagedHost(host) && <>
                          <Button variant="ghost" disabled={!one} onClick={menuAction(() => onHostAction("edit", host))}>编辑</Button>
                          <Button variant="ghost" disabled={!one} onClick={menuAction(() => onHostAction("copy", host))}>复制</Button>
                          <Button variant="ghost" disabled={!menuManaged || busy} onClick={menuAction(() => one ? onHostAction("remove", host) : confirmRemoval(menuIds))}>删除</Button>
                        </>}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                </div>
              </li>
            );
          })}
        </ul>
      ) : <EmptyState icon={Server} title={directory ? "没有符合条件的主机" : "等待读取主机目录"} />}
      {dialog ? (
        <Dialog
          open title={dialogTitle[dialog.kind]}
          error={error}
          onClose={() => { if (!busy) setDialog(undefined); }}
          actions={<>
            <Button disabled={busy} onClick={() => setDialog(undefined)}>取消</Button>
            <Button type="submit" form={formId} loading={busy} disabled={groupNameField && !groupName.trim()}>
              {dialog.kind === "delete-group" ? "确认删除" : "保存"}
            </Button>
          </>}
        >
          <form id={formId} onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}>
            {groupNameField ? <Field label="分组名称"><input aria-label="分组名称" required value={groupName} onChange={(event) => setGroupName(event.target.value)} /></Field> : null}
            {destinationField ? (
              <Field label={destinationLabel}>
                <Select aria-label={destinationLabel} value={destination} onChange={(event) => setDestination(event.target.value)}>
                  <option value="">{dialog.kind === "move-hosts" ? "未分组" : "顶层"}</option>
                  {groupOptions(dialog.kind === "move-group" ? groupsInScope(groups, dialog.groupId) : undefined)}
                </Select>
              </Field>
            ) : null}
            {dialog.kind === "delete-group" ? <p>删除「{managedGroup?.name}」前请移出该分组的主机与子分组。</p> : null}
          </form>
        </Dialog>
      ) : null}
      {removing ? (
        <Dialog open title="删除所选主机" onClose={() => { if (!busy) setRemoving(undefined); }}
          actions={<>
            <Button autoFocus disabled={busy} onClick={() => setRemoving(undefined)}>取消</Button>
            <Button variant="danger" loading={busy} onClick={() => void removeHosts()}>确认删除</Button>
          </>}
        >
          <p>删除以下主机配置和本机认证资料。仍被引用的主机会保留。</p>
          <ul>{removing.map((host) => <li key={host.id}>{host.name} · {hostEndpoint(host)}</li>)}</ul>
        </Dialog>
      ) : null}
    </section>
  );
}
