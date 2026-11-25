import { Badge, Button, Dialog, EmptyState, Field, PageHead, SearchBox, Segmented, Select } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { Server } from "lucide-react";
import { useId, useState } from "react";
import type { z } from "zod";
import type { DirectoryUpdate, DirectoryView } from "../engine/directory-schema.js";
import { maxRouteEditTargets } from "../engine/route-edits.js";
import { directoryGroupPath, groupsInScope, hostSearchTerms, matchesHostSearch } from "../shared/host-directory.js";
import { MAX_WORKSPACE_PANES } from "../shared/workspace.js";
import type { ConnectionStatus } from "../shared/trust.js";
import { hostEndpoint } from "./HostKeyDialog.js";
import { isManagedHost, type Host, type ManagedHost } from "./host-record.js";

type Directory = z.output<typeof DirectoryView>;
type Operation = z.input<typeof DirectoryUpdate>["operation"];
type DirectoryDialog = { kind: "create-group" | "move-hosts"; version: string } |
  { kind: "rename-group" | "move-group" | "delete-group"; version: string; groupId: string };
const dialogTitle: Record<DirectoryDialog["kind"], string> = {
  "create-group": "新建主机分组",
  "move-hosts": "移动所选主机",
  "rename-group": "重命名主机分组",
  "move-group": "移动主机分组",
  "delete-group": "删除主机分组",
};

export function HostDirectory({ directory, hosts, statuses, onBack, onOpen, onConnect, onWorkspace, onRoute, onCreate, onImport, onHostAction, onChanged }: {
  directory: Directory | undefined;
  hosts: Host[];
  statuses: ReadonlyMap<string, ConnectionStatus>;
  onBack(): void;
  onOpen(host: Host): void;
  onConnect(host: Host): void;
  onWorkspace(ids: string[], temporary: boolean): void;
  onRoute?: ((ids: string[]) => void) | undefined;
  onCreate?: (() => void) | undefined;
  onImport?: (() => void) | undefined;
  onHostAction?: ((kind: "edit" | "copy" | "remove", host: ManagedHost) => void) | undefined;
  onChanged(): Promise<unknown>;
}) {
  const engine = useEngine();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DirectoryDialog>();
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
  const visibleIds = new Set(visible.map(({ hostId }) => hostId));
  const hiddenSelected = selected.filter((hostId) => !visibleIds.has(hostId)).length;
  const selectedManaged = selected.length > 0 && selected.every((hostId) => isManagedHost(hostById.get(hostId)!));
  const canStart = selectedManaged && selected.length <= MAX_WORKSPACE_PANES;
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

  function open(kind: DirectoryDialog["kind"]) {
    if (!directory) return;
    setError("");
    setGroupName(kind === "rename-group" ? currentGroup?.name ?? "" : "");
    setDestination(kind === "create-group" ? currentGroup?.groupId ?? "" : kind === "move-group" ? currentGroup?.parentId ?? "" : "");
    if (kind === "create-group" || kind === "move-hosts") {
      setDialog({ kind, version: directory.version });
    } else if (currentGroup) {
      setDialog({ kind, version: directory.version, groupId: currentGroup.groupId });
    }
  }

  async function organize(operation: Operation) {
    if (!dialog || busy) return;
    setBusy(true);
    setError("");
    try {
      await engine.call("ssh.hosts.organize", { expectedVersion: dialog.version, operation }, { write: true });
      setDialog(undefined);
      if (operation.type === "group.delete") setGroup("all");
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
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
      case "create-group": return organize({ type: "group.create", parentId, name });
      case "rename-group": return organize({ type: "group.rename", groupId: dialog.groupId, name });
      case "move-group": return organize({ type: "group.move", groupId: dialog.groupId, parentId });
      case "delete-group": return organize({ type: "group.delete", groupId: dialog.groupId });
      case "move-hosts": return organize({ type: "hosts.move", hostIds: selected, groupId: parentId });
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
        <Select aria-label="按主机分组筛选" value={scope || group === "" ? group : "all"} onChange={(event) => setGroup(event.target.value)}>
          <option value="all">全部分组</option>
          <option value="">未分组</option>
          {groupOptions()}
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
        <Button disabled={!selected.length} onClick={() => open("move-hosts")}>移动所选</Button>
        <Button disabled={!canStart} onClick={() => onWorkspace(selected, true)}>连接所选</Button>
        <Button disabled={!canStart} onClick={() => onWorkspace(selected, false)}>从选择建立工作区</Button>
        {onRoute ? <Button disabled={!selectedManaged || selected.length > maxRouteEditTargets} onClick={() => onRoute(selected)}>为所选关联跳板</Button> : null}
      </div>
      {visible.length ? (
        <ul className="ssh-directory-hosts" data-layout={layout} role="list" aria-label="主机">
          {visible.map((entry) => {
            const host = hostById.get(entry.hostId)!;
            const state = statuses.get(host.id)?.state;
            const openConnection = state === "connected" || state === "connecting" || state === "waiting" || state === "auth-waiting" || state === "key-changed";
            return (
              <li key={host.id} className="ssh-directory-host">
                <div className="row">
                  <input type="checkbox" aria-label={`选择 ${host.name}`} checked={checked.has(host.id)} onChange={(event) => toggle(host.id, event.target.checked)} />
                  <strong>{host.name}</strong>
                  {openConnection ? <Badge>{state === "connected" ? "已连接" : "连接待处理"}</Badge> : null}
                </div>
                <code>{host.user}@{hostEndpoint(host)}</code>
                <div className="row">
                  <span>{directoryGroupPath(groupById, entry.groupId) || "未分组"}</span>
                  {entry.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
                </div>
                <div className="row">
                  <Button variant="ghost" aria-label={`打开主机详情 ${host.name}`} onClick={() => onOpen(host)}>详情</Button>
                  {!openConnection && isManagedHost(host) ? <Button variant="ghost" aria-label={`连接 ${host.name}`} onClick={() => onConnect(host)}>连接</Button> : null}
                  {onHostAction && isManagedHost(host) ? (
                    <>
                      <Button variant="ghost" aria-label={`编辑 ${host.name}`} onClick={() => onHostAction("edit", host)}>编辑</Button>
                      <Button variant="ghost" aria-label={`复制 ${host.name}`} onClick={() => onHostAction("copy", host)}>复制</Button>
                      <Button variant="ghost" aria-label={`删除 ${host.name}`} onClick={() => onHostAction("remove", host)}>删除</Button>
                    </>
                  ) : null}
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
            <Button type="submit" form={formId} loading={busy} disabled={groupNameField && !groupName.trim() || dialog.kind === "move-hosts" && !selected.length}>
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
    </section>
  );
}
