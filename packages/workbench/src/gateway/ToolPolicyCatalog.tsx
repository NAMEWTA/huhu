import type { CapabilityCatalogEntry, CapabilityScope, ToolAccessSnapshot } from "@huhu/contracts";
import { Badge, Button, ChoiceSwitch, DataTable, Dialog, EmptyState, Field } from "@huhu/ui";
import { Activity } from "lucide-react";
import { useState } from "react";
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

export function ToolPolicyCatalog({ entries, filter, policy }: { entries: CapabilityCatalogEntry[]; filter: string; policy: ToolAccessSnapshot | undefined }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [batch, setBatch] = useState(batchOptions[0]!.value);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; refresh: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const query = filter.trim().toLocaleLowerCase();
  const list = entries.filter((entry) => [entry.name, entry.title, entry.description].some((text) => text?.toLocaleLowerCase().includes(query)));
  const exposable = entries.filter((entry) => entry.exposable);
  const matching = list.filter((entry) => entry.exposable);
  const picked = exposable.filter((entry) => selection.has(entry.name));
  const matchingSelected = matching.length > 0 && matching.every((entry) => selection.has(entry.name));
  const plugins = [...new Set(exposable.map((entry) => entry.plugin))].sort();
  const policyReady = policy?.state === "ready";

  function toggleSelection(capability: string, checked: boolean) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (checked) next.add(capability);
      else next.delete(capability);
      return next;
    });
  }

  async function showPreview(title: string, changes: Change[]) {
    if (busy || !policyReady) return;
    setNotice("");
    setError(null);
    if (!changes.length) {
      setNotice("当前范围没有可提交的工具。");
      return;
    }
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

  function showBatch() {
    if (batch === "normal-read") {
      void showPreview(
        "仅保留常规只读",
        exposable.map((entry) => ({ capability: entry.name, exposed: entry.scope === "read" && entry.risk !== "high" })),
      );
      return;
    }
    const option = batchOptions.find(({ value }) => value === batch);
    const plugin = batch.startsWith("plugin:") ? batch.slice("plugin:".length) : null;
    const rows = plugin ? exposable.filter((entry) => entry.plugin === plugin) : batch === "add-read" ? exposable.filter((entry) => entry.scope === "read") : batch.endsWith("matching") ? matching : exposable;
    void showPreview(
      plugin ? `开启插件全部 · ${plugin}` : (option?.label ?? "批量选择"),
      rows.map(({ name }) => ({ capability: name, exposed: !batch.startsWith("disable-") })),
    );
  }

  function closePreview() {
    if (busy) return;
    setDraft(null);
    setError(null);
  }

  async function save() {
    if (!draft || busy || error?.refresh) return;
    setBusy(true);
    setError(null);
    try {
      const { revision, changed } = await engine.call<{ revision: number; changed: boolean }>(
        "gateway.policy.update",
        { changes: draft.changes, expectedRevision: draft.preview.revision, catalogRevision: draft.preview.catalogRevision },
        { write: true, idempotencyKey: draft.key },
      );
      setDraft(null);
      setNotice(changed ? `已保存 ${draft.preview.targets.length} 项工具选择。当前版本 ${revision}。` : `工具选择已是当前状态。当前版本 ${revision}。`);
      await qc.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId && ["gateway.get", "capabilities.list"].includes(String(queryKey[1])) });
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
        <fieldset className="hu-stack" disabled={!policyReady}>
          <legend>批量开放策略</legend>
          <div className="row">
            <label className="row">
              <input
                type="checkbox"
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
            <span>选中 {picked.length} 项</span>
            <Button disabled={!picked.length} onClick={() => setSelection(new Set())}>
              清空选择
            </Button>
          </div>
          <div className="row">
            <Button
              disabled={!picked.length}
              onClick={() =>
                void showPreview(
                  "开启所选",
                  picked.map(({ name }) => ({ capability: name, exposed: true })),
                )
              }
            >
              开启所选
            </Button>
            <Button
              disabled={!picked.length}
              onClick={() =>
                void showPreview(
                  "关闭所选",
                  picked.map(({ name }) => ({ capability: name, exposed: false })),
                )
              }
            >
              关闭所选
            </Button>
            <Field label="批量范围">
              <select aria-label="批量范围" value={batch} onChange={(e) => setBatch(e.target.value)}>
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
              </select>
            </Field>
            <Button onClick={showBatch}>预览批量操作</Button>
          </div>
        </fieldset>
        <p role="status">{notice}</p>
        {error && !draft ? (
          <p role="alert" className="hu-field-error">
            {error.message}
          </p>
        ) : null}
        <DataTable
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
              cell: (c) => (c.exposable ? <input type="checkbox" aria-label={`选择 ${c.name}`} disabled={!policyReady} checked={selection.has(c.name)} onChange={(e) => toggleSelection(c.name, e.target.checked)} /> : null),
            },
            { id: "name", header: "能力", width: 260, cell: (c) => <code title={c.description}>{c.name}</code> },
            { id: "plugin", header: "所属模块", width: 120, cell: (c) => (c.plugin === "kernel" ? "基础能力" : c.plugin) },
            { id: "scope", header: "访问范围", width: 110, cell: (c) => (c.scope ? <Badge tone={c.scope === "read" ? "neutral" : "warning"}>{g.scope[c.scope]}</Badge> : "—") },
            { id: "selected", header: "策略", width: 100, cell: (c) => (c.exposable ? selectionText(c.selected) : g.never) },
            { id: "state", header: "目录可用性", width: 130, cell: (c) => <Badge tone={c.exposed ? "success" : "neutral"}>{c.exposed ? "可调用" : c.availability === "active" ? g.closed : availability[c.availability]}</Badge> },
            {
              id: "expose",
              header: "开放",
              width: 110,
              cell: (c) =>
                c.exposable ? (
                  <ChoiceSwitch disabled={!policyReady} checked={c.selected === true} label={`暴露 ${c.name}`} onChange={(exposed) => void showPreview(exposed ? "开放工具" : "关闭工具", [{ capability: c.name, exposed }])} />
                ) : (
                  <span className="small muted">{g.never}</span>
                ),
            },
          ]}
        />
        {list.length === 0 ? <EmptyState icon={Activity} title="没有匹配的能力" /> : null}
      </section>
      <Dialog
        open={draft !== null}
        title={draft?.title ?? "工具选择"}
        onClose={closePreview}
        error={draft ? error?.message : null}
        wide
        actions={
          <>
            <Button disabled={busy} onClick={closePreview}>
              取消
            </Button>
            {error?.refresh && draft ? (
              <Button variant="primary" loading={busy} onClick={() => void showPreview(draft.title, draft.changes)}>
                刷新预览
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} loading={busy} onClick={() => void save()}>
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
                  <code>{target.capability}</code> · {target.plugin} · {g.scope[target.scope]} · {riskText(target.risk)} · {availability[target.availability]} · {selectionText(target.selected)} → {selectionText(target.exposed)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
