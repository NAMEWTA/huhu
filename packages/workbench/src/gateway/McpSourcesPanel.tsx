import { type McpCatalogView, type McpEntryKind, type McpSource, type McpSourceDeletePreview, type McpSourcesView, type McpSourceView } from "@huhu/contracts";
import { Badge, Button, DataTable, Dialog } from "@huhu/ui";
import { useEffect, useId, useRef, useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { host } from "../settings/host.js";
import { McpField, McpImportDialog, McpSourceEditor } from "./McpSourceDialogs.js";

const states: Record<McpSourceView["state"], string> = {
  ready: "已连接",
  disabled: "已停用",
  offline: "离线",
  stale: "目录已失效",
  "auth-required": "需认证",
  "approval-required": "需本机执行许可",
  incompatible: "协议不兼容",
};
const credentialStates: Record<string, string> = {
  configured: "已绑定",
  unconfigured: "未绑定",
  "temporarily-unavailable": "本机凭据不可用",
  "needs-reconfiguration": "需重新绑定",
  corrupt: "凭据不可读取",
};
const directoryId: Record<McpEntryKind, string> = { tool: "mcp-tools", resource: "mcp-resources", "resource-template": "mcp-templates", prompt: "mcp-prompts" };
const entryLabels: Record<McpEntryKind, string> = { tool: "工具", resource: "资源", "resource-template": "资源模板", prompt: "提示" };
type Row = McpCatalogView["entries"][number];
type Choice = Pick<Row, "sourceId" | "kind" | "upstreamIdentity" | "selected">;
type Subject = { sourceId: string; expectedRevision: number };
type Login = { attemptId: string; authorizationUrl: string; expiresAt: number };
type LoginStatus = { state: "waiting" | "exchanging" | "complete" | "cancelled" | "expired" | "failed" };

const ref = (source: McpSource): Subject => ({ sourceId: source.sourceId, expectedRevision: source.revision });
const address = (source: McpSource) => (source.configuration.transport === "stdio" ? source.configuration.command : source.configuration.url);

export function McpSourcesPanel({ kind, filter, published }: { kind: McpEntryKind; filter: string; published: boolean }) {
  const engine = useEngine();
  const queries = useQueryClient();
  const sources = useCapability<McpSourcesView>("mcp.sources.list");
  const catalog = useCapability<McpCatalogView>("mcp.catalog.list");
  const [selected, setSelected] = useState<Subject["sourceId"] | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dialog, setDialog] = useState<"add" | "edit" | "import" | "confirm" | "delete" | "policy" | "auth" | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; text: string; action: string; input: unknown } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpSource | null>(null);
  const [policy, setPolicy] = useState<{ choices: Choice[]; names: string[]; expectedCatalogRevision: number; expectedPolicyRevision: number } | null>(null);
  const [login, setLogin] = useState<Login | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const formId = useId();
  const cancelAction = useRef<HTMLButtonElement>(null);
  const deleteAction = useRef<HTMLButtonElement>(null);
  const directory = sources.data?.sources ?? [];
  const active = directory.find((entry) => entry.source.sourceId === selected);
  const activeFilter = sourceFilter === "all" || sourceFilter === "builtin" || directory.some(({ source }) => source.sourceId === sourceFilter) ? sourceFilter : "all";
  const locked = !sources.data || sources.data.readOnly || busy;
  const visible = (catalog.data?.entries ?? []).filter((entry) => entry.kind === kind && (activeFilter === "all" || entry.sourceId === activeFilter) && entry.publicKey.toLowerCase().includes(filter.trim().toLowerCase()));
  const pending = useCapability<LoginStatus>("mcp.oauth.status", { attemptId: login?.attemptId ?? "" }, { enabled: login !== null });
  const deletePreview = useCapability<McpSourceDeletePreview>("mcp.sources.deletePreview", deleteTarget ? ref(deleteTarget) : {}, { enabled: deleteTarget !== null });
  const refetchLogin = pending.refetch;
  const loginState = pending.data?.state;

  function refresh() {
    return queries.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId });
  }
  useEffect(() => {
    if (!login || (loginState && loginState !== "waiting" && loginState !== "exchanging")) return;
    const timer = setInterval(() => {
      void refetchLogin();
    }, 1000);
    return () => clearInterval(timer);
  }, [login, loginState, refetchLogin]);
  useEffect(() => {
    if (loginState === "complete") void queries.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === engine.vaultId });
  }, [engine.vaultId, loginState, queries]);

  async function run<T = unknown>(name: string, input: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const result = await engine.call<T>(name, input, { write: true });
      await refresh();
      return result;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败");
      return null;
    } finally {
      setBusy(false);
    }
  }
  function open(next: typeof dialog) {
    setError(null);
    setDialog(next);
  }
  function close() {
    setDialog(null);
    setError(null);
    setLogin(null);
    setDeleteTarget(null);
  }
  async function confirmApproval(view: McpSourceView) {
    const source = view.source;
    const preview = await run<{ configurationFingerprint: string }>("mcp.executionApproval.preview", ref(source));
    if (!preview || source.configuration.transport !== "stdio") return;
    const config = source.configuration;
    const action = view.approved ? "撤销本机许可" : "授予本机许可";
    setConfirm({
      title: action,
      text: `${source.displayName} · ${config.command} ${JSON.stringify(config.args)}`,
      action: view.approved ? "mcp.executionApproval.revoke" : "mcp.executionApproval.confirm",
      input: { ...ref(source), configurationFingerprint: preview.configurationFingerprint },
    });
    open("confirm");
  }
  async function previewPolicy(rows: Row[], enabled: boolean) {
    if (!catalog.data) return;
    const input = {
      expectedCatalogRevision: catalog.data.catalogRevision,
      expectedPolicyRevision: catalog.data.policyRevision,
      choices: rows.map(({ sourceId, kind, upstreamIdentity }) => ({ sourceId, kind, upstreamIdentity, selected: enabled })),
    };
    if (!(await run("mcp.policy.preview", input))) return;
    setPolicy({ ...input, names: rows.map((row) => row.publicKey) });
    open("policy");
  }
  async function exportSources() {
    const exported = await run("mcp.sources.export", {});
    if (!exported) return;
    const text = JSON.stringify(exported, null, 2) + "\n";
    const desktop = host();
    if (desktop?.saveTextFile) {
      try {
        await desktop.saveTextFile("mcp-sources.json", text);
      } catch {
        setError("导出失败，请重试。");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "mcp-sources.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function check(view: McpSourceView, action: string) {
    const result = await run<{ diagnostic: string | null; state: McpSourceView["state"]; toolCount: number }>(action, ref(view.source));
    if (result) setNotice(result.diagnostic ?? (result.state === "ready" ? `检查成功 · 发现 ${result.toolCount} 个工具` : states[result.state]));
  }
  const auth = active?.source.configuration.transport !== "stdio" ? active?.source.configuration.authentication : undefined;
  const isOAuth = auth?.kind === "oauth";
  const scopeRows = visible.filter((row) => row.sourceId !== "builtin");

  return (
    <div className="hu-stack hu-mcp-sources" data-testid="gateway-mcp-sources">
      <section className="hu-card-alt">
        <div className="shell-card-head">
          <h2>外部 MCP 服务</h2>
          <div className="row">
            <Button onClick={() => open("add")} disabled={locked}>
              添加服务
            </Button>
            <Button onClick={() => open("import")} disabled={locked}>
              导入 JSON
            </Button>
            <Button onClick={() => void exportSources()} disabled={!sources.data || busy}>
              脱敏导出
            </Button>
          </div>
        </div>
        {sources.data?.readOnly ? <p role="status">Vault 以只读方式打开。可以查看配置和目录。</p> : null}
        {sources.isPending ? (
          <p role="status">正在读取外部来源…</p>
        ) : sources.isError ? (
          <p role="alert">{sources.error.message}</p>
        ) : (
          <DataTable
            label="外部 MCP 服务列表"
            scrollLabel="滚动查看外部 MCP 服务"
            rows={directory}
            rowKey={({ source }) => source.sourceId}
            empty={<p>还没有外部来源。添加服务或导入已有配置。</p>}
            columns={[
              {
                id: "service",
                header: "服务",
                width: 220,
                cell: ({ source }) => (
                  <Button variant="ghost" onClick={() => setSelected(source.sourceId)} aria-label={`查看 ${source.displayName}`}>
                    {source.displayName}
                  </Button>
                ),
              },
              {
                id: "transport",
                header: "传输与地址",
                width: 250,
                cell: ({ source }) => (
                  <>
                    {source.configuration.transport} · <code>{address(source)}</code>
                  </>
                ),
              },
              { id: "state", header: "连接状态", width: 150, cell: (entry) => <Badge tone={entry.state === "ready" ? "success" : "neutral"}>{states[entry.state]}</Badge> },
              {
                id: "auth",
                header: "认证",
                width: 160,
                cell: (entry) => {
                  const config = entry.source.configuration;
                  return config.transport === "stdio"
                    ? entry.approved
                      ? "已授权执行"
                      : "待执行授权"
                    : config.authentication.kind === "none"
                      ? "无认证"
                      : config.authentication.kind === "environment"
                        ? "环境变量引用"
                        : (credentialStates[entry.credential.state] ?? entry.credential.state);
                },
              },
              {
                id: "checked",
                header: "最近检查 / 目录",
                width: 190,
                cell: (entry) => {
                  const items = (catalog.data?.entries ?? []).filter((item) => item.sourceId === entry.source.sourceId);
                  return (
                    <>
                      {entry.checkedAt ? new Date(entry.checkedAt).toLocaleString() : "尚未检查"} · {items.filter((item) => item.selected).length}/{items.length} 已选择
                    </>
                  );
                },
              },
            ]}
          />
        )}
      </section>
      {active ? (
        <section className="hu-card-alt hu-stack" data-testid="mcp-source-detail">
          <div className="shell-card-head">
            <h2>{active.source.displayName}</h2>
            <div className="row">
              <Button onClick={() => open("edit")} disabled={locked}>
                编辑
              </Button>
              <Button
                ref={deleteAction}
                variant="danger"
                disabled={locked}
                onClick={() => {
                  setDeleteTarget(active.source);
                  open("delete");
                }}
              >
                删除
              </Button>
            </div>
          </div>
          <p>
            <code>{active.source.namespace}</code> · {active.source.enabled ? "已启用" : "未启用"} · {states[active.state]}
          </p>
          <p>{active.diagnostic ?? active.checkedAt ?? "尚未检查连接"}</p>
          <div className="row">
            <Button disabled={locked} onClick={() => void check(active, "mcp.sources.check")}>
              检查连接
            </Button>
            <Button disabled={locked} onClick={() => void check(active, "mcp.sources.reconnect")}>
              重新连接
            </Button>
            <Button disabled={locked} onClick={() => void check(active, "mcp.sources.refresh")}>
              刷新目录
            </Button>
            <Button disabled={locked} onClick={() => void run("mcp.sources.setEnabled", { ...ref(active.source), enabled: !active.source.enabled })}>
              {active.source.enabled ? "停用来源" : "启用来源"}
            </Button>
          </div>
          <h3>认证与本机许可</h3>
          {active.source.configuration.transport === "stdio" ? (
            <Button disabled={locked} onClick={() => void confirmApproval(active)}>
              {active.approved ? "撤销本机许可" : "核对命令并授权"}
            </Button>
          ) : auth?.kind === "none" ? (
            <p>无认证</p>
          ) : auth?.kind === "environment" ? (
            <p>
              环境变量引用 · <code>{auth.name}</code>
            </p>
          ) : (
            <>
              <p>
                {credentialStates[active.credential.state] ?? active.credential.state}
                {active.credential.account ? ` · ${active.credential.account}` : ""}
              </p>
              <div className="row">
                <Button disabled={locked || !sources.data?.credentialHostAvailable} onClick={() => open("auth")}>
                  {isOAuth ? "登录 OAuth" : "绑定认证"}
                </Button>
                {active.credential.account ? (
                  <Button disabled={locked} onClick={() => void run(isOAuth ? "mcp.oauth.logout" : "mcp.credentials.remove", ref(active.source))}>
                    {isOAuth ? "注销 OAuth" : "移除绑定"}
                  </Button>
                ) : null}
              </div>
            </>
          )}
          <Button onClick={() => setSourceFilter(active.source.sourceId)}>查看此来源的目录</Button>
        </section>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error && !dialog ? <p role="alert">{error}</p> : null}

      <section className="hu-card-alt" data-testid={directoryId[kind]}>
        <div className="shell-card-head">
          <h2>能力目录</h2>
          <div className="row">
            <McpField label="按来源筛选">
              <select value={activeFilter} onChange={(event) => setSourceFilter(event.currentTarget.value)}>
                <option value="all">全部来源</option>
                <option value="builtin">Huhu 内置</option>
                {directory.map(({ source }) => (
                  <option value={source.sourceId} key={source.sourceId}>
                    {source.displayName}
                  </option>
                ))}
              </select>
            </McpField>
            {scopeRows.length ? (
              <>
                <Button disabled={locked} onClick={() => void previewPolicy(scopeRows, true)}>
                  批量开放
                </Button>
                <Button disabled={locked} onClick={() => void previewPolicy(scopeRows, false)}>
                  批量撤销
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {catalog.isPending ? (
          <p role="status">正在读取能力目录…</p>
        ) : catalog.isError ? (
          <p role="alert">{catalog.error.message}</p>
        ) : (
          <DataTable
            label="MCP 能力目录"
            rows={visible}
            rowKey={(entry) => JSON.stringify([entry.sourceId, entry.kind, entry.upstreamIdentity])}
            empty={<p>此来源尚无已发现的条目。可以检查或刷新来源目录。</p>}
            columns={[
              { id: "name", header: "公开标识", width: 270, cell: (entry) => <code>{entry.publicKey}</code> },
              { id: "source", header: "来源", width: 165, cell: (entry) => (entry.sourceId === "builtin" ? "Huhu 内置" : (directory.find(({ source }) => source.sourceId === entry.sourceId)?.source.displayName ?? "外部 MCP")) },
              {
                id: "policy",
                header: "开放状态",
                width: 165,
                cell: (entry) => {
                  const origin = directory.find(({ source }) => source.sourceId === entry.sourceId);
                  return entry.sourceId === "builtin" ? "由现有能力权限管理" : !entry.selected ? "未开放" : !published ? "服务已关闭" : origin?.state === "ready" ? "已开放" : origin ? states[origin.state] : "已选择";
                },
              },
              {
                id: "actions",
                header: "操作",
                width: 155,
                cell: (entry) =>
                  entry.sourceId !== "builtin" ? (
                    <Button disabled={locked} aria-label={`${entry.selected ? "撤销开放" : "选择开放"} ${entry.publicKey}`} onClick={() => void previewPolicy([entry], !entry.selected)}>
                      {entry.selected ? "撤销开放" : "选择开放"}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </section>

      {dialog === "add" || (dialog === "edit" && active) ? (
        <McpSourceEditor key={dialog === "add" ? "new" : active?.source.sourceId} {...(dialog === "edit" && active && { source: active.source })} busy={busy} error={error} save={run} onClose={close} />
      ) : null}
      {dialog === "import" ? <McpImportDialog busy={busy} error={error} run={run} onClose={close} /> : null}
      {dialog === "confirm" && confirm ? (
        <Dialog
          open
          title={confirm.title}
          onClose={close}
          error={error}
          initialFocusRef={cancelAction}
          actions={
            <>
              <Button ref={cancelAction} onClick={close}>
                取消
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={async () => {
                  if (await run(confirm.action, confirm.input)) close();
                }}
              >
                确认
              </Button>
            </>
          }
        >
          <p>{confirm.text}</p>
        </Dialog>
      ) : null}
      {dialog === "delete" && deleteTarget ? (
        <Dialog
          open
          title="删除 MCP 服务"
          onClose={close}
          error={error}
          className="hu-mcp-delete-dialog"
          initialFocusRef={cancelAction}
          returnFocusRef={deleteAction}
          actions={
            <>
              <Button ref={cancelAction} onClick={close}>
                取消
              </Button>
              <Button
                variant="danger"
                disabled={locked || deletePreview.isFetching || deletePreview.isError || !deletePreview.data}
                onClick={async () => {
                  if (!deletePreview.data) return;
                  if (await run("mcp.sources.delete", { ...ref(deleteTarget), expectedPolicyRevision: deletePreview.data.policyRevision })) close();
                }}
              >
                确认删除
              </Button>
            </>
          }
        >
          <div className="hu-stack">
            <p>删除「{deleteTarget.displayName}」</p>
            {deletePreview.isFetching ? (
              <p role="status">正在读取删除影响…</p>
            ) : deletePreview.isError ? (
              <p role="alert">无法读取删除影响：{deletePreview.error.message}</p>
            ) : deletePreview.data ? (
              <>
                <p>{deletePreview.data.entries.length ? `将撤下 ${deletePreview.data.entries.length} 项开放路由` : "没有开放路由"}</p>
                {deletePreview.data.entries.length ? (
                  <ul aria-label="将撤下的公开条目">
                    {deletePreview.data.entries.map(({ kind, publicKey }) => (
                      <li key={`${kind}:${publicKey}`}>
                        {entryLabels[kind]} · <code>{publicKey}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p>本机执行许可：{deletePreview.data.hasExecutionApproval ? "已授权，删除后失效" : "无绑定"}</p>
                <p>本机凭据：{deletePreview.data.clearsLocalCredential ? "有绑定，将移除" : "无绑定"}</p>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {dialog === "policy" && policy ? (
        <Dialog
          open
          title="预览开放变更"
          onClose={close}
          error={error}
          initialFocusRef={cancelAction}
          actions={
            <>
              <Button ref={cancelAction} onClick={close}>
                取消
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={async () => {
                  const { names: _names, ...input } = policy;
                  if (await run("mcp.policy.update", input)) close();
                }}
              >
                确认更新开放策略
              </Button>
            </>
          }
        >
          <p>
            {policy.choices[0]?.selected ? "开放" : "撤销开放"} {policy.choices.length} 项
          </p>
          <ul>
            {policy.names.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </Dialog>
      ) : null}
      {dialog === "auth" && active ? (
        <Dialog
          open
          title={isOAuth ? "OAuth 登录" : "绑定认证"}
          onClose={() => {
            if (login && loginState !== "complete") void run("mcp.oauth.cancel", { attemptId: login.attemptId });
            close();
          }}
          error={error}
          actions={
            <>
              <Button
                onClick={() => {
                  if (login && loginState !== "complete") void run("mcp.oauth.cancel", { attemptId: login.attemptId });
                  close();
                }}
              >
                {loginState === "complete" ? "完成" : "取消"}
              </Button>
              {!login ? (
                <Button type="submit" form={formId} disabled={busy} variant="primary">
                  {isOAuth ? "开始登录" : "绑定凭据"}
                </Button>
              ) : null}
            </>
          }
        >
          {login ? (
            <div className="hu-stack">
              <a
                href={login.authorizationUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  const openExternal = host()?.openExternal;
                  if (openExternal) {
                    event.preventDefault();
                    void openExternal(login.authorizationUrl).catch(() => setError("无法打开授权页。"));
                  }
                }}
              >
                打开授权页
              </a>
              <p role="status">
                {loginState === "complete"
                  ? "认证已完成"
                  : loginState === "exchanging"
                    ? "正在验证授权"
                    : loginState === "expired"
                      ? "授权已过期"
                      : loginState === "failed"
                        ? "授权失败"
                        : loginState === "cancelled"
                          ? "授权已取消"
                          : "等待浏览器授权"}
              </p>
            </div>
          ) : (
            <form
              id={formId}
              className="hu-stack"
              aria-label={isOAuth ? "OAuth 登录表单" : "绑定凭据表单"}
              onSubmit={async (event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                const account = String(values.get("account") ?? "");
                if (isOAuth) {
                  const started = await run<Login>("mcp.oauth.begin", { ...ref(active.source), account });
                  if (started) setLogin(started);
                } else if (await run("mcp.credentials.put", { ...ref(active.source), account, header: values.get("header"), value: values.get("value") })) close();
              }}
            >
              <McpField label="账号标签">
                <input name="account" required autoFocus maxLength={128} />
              </McpField>
              {isOAuth ? (
                <p>请在运行 Engine 的设备上打开授权页。</p>
              ) : (
                <>
                  <McpField label="认证 header">
                    <input name="header" defaultValue={auth?.kind === "credential" || auth?.kind === "credential-needed" ? auth.header : "Authorization"} required />
                  </McpField>
                  <McpField label="完整 header 值">
                    <input name="value" type="password" required autoComplete="off" />
                  </McpField>
                </>
              )}
            </form>
          )}
        </Dialog>
      ) : null}
    </div>
  );
}
