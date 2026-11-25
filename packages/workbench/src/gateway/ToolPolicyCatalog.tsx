import type { CapabilityCatalogEntry, CapabilityScope, ToolAccessSnapshot } from "@huhu/contracts";
import { Badge, Button, ChoiceSwitch, DataTable, Dialog, EmptyState, Field, Select } from "@huhu/ui";
import { Activity } from "lucide-react";
import { useRef, useState } from "react";
import { CapabilityError, createRequestId } from "../engine-client/client.js";
import { useEngine, useQueryClient } from "../engine-client/react.js";
import { tGateway as g } from "../i18n/zh-CN.js";

type Change = { capability: string; exposed: boolean };
type Target = Change & {
  plugin: string;
  title: string;
  scope: CapabilityScope;
  risk: NonNullable<CapabilityCatalogEntry["risk"]>;
  availability: CapabilityCatalogEntry["availability"];
  selected: boolean | null;
};
type Preview = { revision: number; catalogRevision: string; targets: Target[] };
type Draft = { title: string; changes: Change[]; preview: Preview; key: string };

const batchOptions = [
  { value: "add-read", label: "启用全部只读" },
  { value: "normal-read", label: "仅保留常规只读" },
  { value: "enable-matching", label: "开启筛选结果" },
  { value: "disable-matching", label: "关闭筛选结果" },
  { value: "enable-all", label: "开启全目录" },
  { value: "disable-all", label: "关闭全目录" },
];

const availability: Record<CapabilityCatalogEntry["availability"], string> = {
  active: "所属模块可用",
  "plugin-disabled": "模块已停用",
  "plugin-failed": "模块运行失败",
  "handler-missing": "处理函数未注册",
};

const selectionText = (selected: boolean | null) => (selected === null ? "未配置" : selected ? "开放" : "关闭");
const riskText = (risk: CapabilityCatalogEntry["risk"]) => (risk === "high" ? "高风险" : "常规");
const canChoose = (entry: CapabilityCatalogEntry) => entry.exposable && (entry.availability === "active" || entry.selected === true);
const canBatchOpen = (entry: CapabilityCatalogEntry) => entry.availability === "active" && !entry.individualExposure && entry.selected !== true;

export function ToolPolicyCatalog({ entries, catalogFailed, filter, policy, restriction, published }: {
  entries: CapabilityCatalogEntry[] | undefined;
  catalogFailed: boolean;
  filter: string;
  policy: ToolAccessSnapshot | undefined;
  restriction: string | undefined;
  published: boolean;
}) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [batch, setBatch] = useState(batchOptions[0]!.value);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; refresh: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const query = filter.trim().toLocaleLowerCase();
  const list = (entries ?? []).filter((entry) => [entry.name, entry.title, entry.description].some((text) => text?.toLocaleLowerCase().includes(query)));
  const exposable = (entries ?? []).filter((entry) => entry.exposable);
  const matching = list.filter(canChoose);
  const picked = exposable.filter((entry) => canChoose(entry) && selection.has(entry.name));
  const openPicked = picked.filter(canBatchOpen);
  const revokePicked = picked.filter((entry) => entry.selected === true);
  const matchingChosen = matching.filter((entry) => selection.has(entry.name)).length;
  const matchingSelected = matchingChosen > 0 && matchingChosen === matching.length;
  const plugins = [...new Set(exposable.map((entry) => entry.plugin))].sort();
  const editable = policy?.state === "ready" && !restriction && !catalogFailed;
  const totalGranted = policy?.state === "ready" && entries ? exposable.filter((entry) => entry.selected === true).length : null;

  function toggleSelection(capability: string, checked: boolean) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(capability);
      else next.delete(capability);
      return next;
    });
  }

  async function showPreview(title: string, changes: Change[], trigger?: HTMLButtonElement) {
    if (busy || !editable || changes.length === 0) return;
    if (trigger) previewTrigger.current = trigger;
    setNotice("");
    setError(null);
    setBusy(true);
    try {
      const preview = await engine.call<Preview>("gateway.policy.preview", { changes });
      setDraft({ title, changes, preview, key: createRequestId() });
    } catch (failure) {
      setError({ message: failure instanceof Error ? failure.message : String(failure), refresh: !!draft });
    } finally {
      setBusy(false);
    }
  }

  function batchChanges(): Change[] {
    if (batch === "normal-read") {
      return exposable.flatMap((entry) => {
        const keep = entry.scope === "read" && entry.risk !== "high";
        if (keep ? !canBatchOpen(entry) : entry.selected !== true) return [];
        return [{ capability: entry.name, exposed: keep }];
      });
    }
    const plugin = batch.startsWith("plugin:") ? batch.slice("plugin:".length) : null;
    const rows = plugin ? exposable.filter((entry) => entry.plugin === plugin) : batch === "add-read" ? exposable.filter((entry) => entry.scope === "read") : batch.endsWith("matching") ? matching : exposable;
    const opening = !batch.startsWith("disable-");
    return rows.filter((entry) => opening ? canBatchOpen(entry) : entry.selected === true).map(({ name }) => ({ capability: name, exposed: opening }));
  }
  const batchDraft = batchChanges();
  const batchTitle = batchOptions.find(({ value }) => value === batch)?.label ?? `开启插件全部 · ${batch.slice("plugin:".length)}`;

  function closePreview() {
    if (busy) return;
    setDraft(null);
    setError(null);
  }

  async function save() {
    if (!draft || busy || !editable || error?.refresh) return;
    setBusy(true);
    setError(null);
    try {
      const { revision, changed } = await engine.call<{ revision: number; changed: boolean }>(
        "gateway.policy.update",
        { changes: draft.changes, expectedRevision: draft.preview.revision, catalogRevision: draft.preview.catalogRevision },
        { write: true, idempotencyKey: draft.key },
      );
      setDraft(null);
      await qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId && ["gateway.get", "capabilities.list"].includes(String(queryKey[1])) });
      setNotice(changed ? `已保存 ${draft.preview.targets.length} 项工具选择。当前版本 ${revision}。` : `工具选择已是当前状态。当前版本 ${revision}。`);
    } catch (failure) {
      if (failure instanceof CapabilityError && failure.code === "VERSION_CONFLICT") {
        setError({ message: "策略或工具目录已变化。请刷新预览后核对目标及当前选择。", refresh: true });
      } else if (failure instanceof CapabilityError && failure.code !== "INTERNAL" && failure.code !== "UNAUTHENTICATED") {
        setDraft({ ...draft, key: createRequestId() });
        setError({ message: failure.message, refresh: false });
      } else {
        setError({ message: "未收到保存确认。可以用原请求核对本次结果。", refresh: false });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {policy?.state === "error" ? (
        <p role="alert" className="hu-callout danger">
          {policy.message}，外部调用已暂停。
        </p>
      ) : null}
      <section className="hu-card-alt" aria-label="工具开放策略">
        <h3>内置工具授权</h3>
        {restriction ? <p role="status">{restriction}</p> : null}
        {catalogFailed ? <p role="alert">无法读取工具目录。</p> : !entries ? <p>正在读取工具目录…</p> : null}
        <fieldset className="hu-gateway-grants" disabled={!editable || busy}>
          <legend>授权对象</legend>
          <div className="hu-gateway-grant-actions">
            <label className="row">
              <input
                type="checkbox"
                ref={(checkbox) => { if (checkbox) checkbox.indeterminate = matchingChosen > 0 && !matchingSelected; }}
                disabled={matching.length === 0}
                checked={matchingSelected}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelection((prev) => {
                    const next = new Set(prev);
                    for (const entry of matching) {
                      if (checked) next.add(entry.name);
                      else next.delete(entry.name);
                    }
                    return next;
                  });
                }}
              />
              选择全部匹配项
            </label>
            <span role="status">
              选中 {picked.length} 项{totalGranted !== null ? ` · 已授权 ${totalGranted} 项` : ""}
              {picked.length ? ` · 可批量开启 ${openPicked.length} 项 · 可撤销 ${revokePicked.length} 项` : ""}
            </span>
            <Button disabled={!picked.length} onClick={() => setSelection(new Set())}>
              清空选择
            </Button>
          </div>
          <div className="hu-gateway-grant-actions">
            <Button
              disabled={!openPicked.length}
              onClick={(event) =>
                void showPreview(
                  "开启所选",
                  openPicked.map(({ name }) => ({ capability: name, exposed: true })),
                  event.currentTarget,
                )
              }
            >
              开启所选
            </Button>
            <Button
              disabled={!revokePicked.length}
              onClick={(event) =>
                void showPreview(
                  "关闭所选",
                  revokePicked.map(({ name }) => ({ capability: name, exposed: false })),
                  event.currentTarget,
                )
              }
            >
              关闭所选
            </Button>
          </div>
        </fieldset>
        <fieldset className="hu-gateway-grants" disabled={!editable || busy || !exposable.length}>
          <legend>批量开放策略</legend>
          <div className="hu-gateway-grant-actions">
            <Field label="批量范围">
              <Select aria-label="批量范围" value={batch} onChange={(e) => setBatch(e.target.value)}>
                {batchOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {plugins.map((plugin) => (
                  <option key={plugin} value={`plugin:${plugin}`}>
                    开启插件全部 · {plugin}
                  </option>
                ))}
              </Select>
            </Field>
            <Button disabled={batchDraft.length === 0} onClick={(event) => void showPreview(batchTitle, batchDraft, event.currentTarget)}>预览批量操作</Button>
          </div>
        </fieldset>
        <p role="status">{busy && !draft ? "正在更新工具选择…" : notice}</p>
        {error && !draft ? (
          <p role="alert" className="hu-field-error">
            {error.message}
          </p>
        ) : null}
        {list.length ? <DataTable
          label="能力开放列表"
          rows={list}
          rowKey={(c) => c.name}
          rowTestId="cap-row"
          rowAttrs={(c) => ({ "data-cap": c.name })}
          columns={[
            {
              id: "select",
              header: "选择",
              width: 72,
              cell: (c) => (c.exposable ? <input type="checkbox" aria-label={`选择 ${c.name}`} disabled={!editable || busy || !canChoose(c)} checked={canChoose(c) && selection.has(c.name)} onChange={(e) => toggleSelection(c.name, e.target.checked)} /> : null),
            },
            { id: "name", header: "能力", width: 260, cell: (c) => <code title={c.description}>{c.name}</code> },
            { id: "plugin", header: "所属模块", width: 120, cell: (c) => (c.plugin === "kernel" ? "基础能力" : c.plugin) },
            { id: "scope", header: "访问范围", width: 110, cell: (c) => (c.scope ? <Badge tone={c.scope === "read" ? "neutral" : "warning"}>{g.scope[c.scope]}</Badge> : "—") },
            { id: "selected", header: "策略", width: 130, cell: (c) => (c.individualExposure ? `${selectionText(c.selected)} · 逐项开放` : c.exposable ? selectionText(c.selected) : g.never) },
            { id: "state", header: "MCP 调用状态", width: 150, cell: (c) => <Badge tone={c.exposed && published ? "success" : "neutral"}>{c.availability !== "active" ? availability[c.availability] : !c.exposed ? g.closed : published ? "可调用" : "服务已关闭"}</Badge> },
            {
              id: "expose",
              header: "开放",
              width: 110,
              cell: (c) =>
                c.exposable ? (
                  <ChoiceSwitch disabled={!editable || busy || !canChoose(c)} checked={c.selected === true} label={`暴露 ${c.name}`} onChange={(exposed, trigger) => void showPreview(exposed ? "开放工具" : "关闭工具", [{ capability: c.name, exposed }], trigger)} />
                ) : (
                  <span className="small muted">{g.never}</span>
                ),
            },
          ]}
        /> : entries && !catalogFailed ? <EmptyState icon={Activity} title={entries.length ? "没有匹配的能力" : "当前没有可配置的工具"} /> : null}
      </section>
      <Dialog
        open={draft !== null}
        title={draft?.title ?? "工具选择"}
        onClose={closePreview}
        error={draft ? error?.message : null}
        initialFocusRef={cancel}
        returnFocusRef={previewTrigger}
        wide
        actions={
          <>
            <Button ref={cancel} disabled={busy} onClick={closePreview}>
              取消
            </Button>
            {error?.refresh && draft ? (
              <Button variant="primary" disabled={!editable} loading={busy} onClick={() => void showPreview(draft.title, draft.changes)}>
                刷新预览
              </Button>
            ) : (
              <Button variant={draft?.changes.some(({ exposed }) => !exposed) ? "danger" : "primary"} disabled={!editable || busy} loading={busy} onClick={() => void save()}>
                {error?.message.startsWith("未收到") ? "核对保存" : "保存选择"}
              </Button>
            )}
          </>
        }
      >
        {draft ? (
          <>
            <p>
              涉及 {draft.preview.targets.length} 项 · 高风险 {draft.preview.targets.filter((target) => target.risk === "high").length} 项 · 策略版本 {draft.preview.revision}
            </p>
            <ul aria-label="明确的工具范围">
              {draft.preview.targets.map((target) => (
                <li key={target.capability}>
                  {target.title !== target.capability ? `${target.title} · ` : ""}<code>{target.capability}</code> · {target.plugin} · {g.scope[target.scope]} · {riskText(target.risk)} · {availability[target.availability]} · {selectionText(target.selected)} → {selectionText(target.exposed)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
