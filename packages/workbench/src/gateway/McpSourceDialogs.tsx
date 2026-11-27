import { McpSourceConfigSchema, type McpSource } from "@huhu/contracts";
import { Button, Dialog } from "@huhu/ui";
import { Fragment, useId, useState, type FormEvent, type ReactNode } from "react";

export function McpField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="hu-field">
      <span className="hu-field-label">{label}</span>
      {children}
    </label>
  );
}

export interface McpImportPreview {
  previewId: string;
  sourcesRevision: number;
  entries: { entryId: string; namespace: string | null; displayName: string | null; state: "ready" | "conflict" | "blocked" | "invalid"; diagnostic: string | null; sensitive?: boolean; sourceId?: string; sourceRevision?: number }[];
}
type Operation = (name: string, input: unknown) => Promise<unknown>;

const transportLabels = { stdio: "stdio", "streamable-http": "Streamable HTTP", sse: "HTTP + SSE（旧版）" };

export function McpSourceEditor({ source, busy, error, onClose, save }: { source?: McpSource; busy: boolean; error: string | null; onClose(): void; save: Operation }) {
  const id = useId();
  const saved = source?.configuration;
  const [transport, setTransport] = useState<McpSource["configuration"]["transport"]>(saved?.transport ?? "stdio");
  const [auth, setAuth] = useState(saved?.transport && saved.transport !== "stdio" ? saved.authentication.kind : "none");
  const [invalid, setInvalid] = useState<string | null>(null);
  const stdio = saved?.transport === "stdio" ? saved : undefined;
  const remote = saved && saved.transport !== "stdio" ? saved : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    try {
      const next =
        transport === "stdio"
          ? {
              transport,
              command: text("command"),
              args: JSON.parse(text("args") || "[]"),
              environment: JSON.parse(text("environment") || "{}"),
              ...(text("cwd") && { cwd: text("cwd") }),
              ...(stdio?.credentialEnvironment && { credentialEnvironment: stdio.credentialEnvironment }),
            }
          : {
              transport,
              url: text("url"),
              headers: JSON.parse(text("headers") || "{}"),
              authentication:
                auth === "environment"
                  ? { kind: auth, name: text("environmentName"), header: text("header") }
                  : remote?.authentication.kind === auth
                    ? remote.authentication
                    : auth === "credential-needed"
                      ? { kind: auth, header: "Authorization" }
                      : { kind: auth },
            };
      const configuration = McpSourceConfigSchema.safeParse(next);
      if (!configuration.success) {
        setInvalid("请检查命令、URL、认证引用和 JSON 字段。");
        return;
      }
      setInvalid(null);
      const shared = { displayName: text("displayName"), configuration: configuration.data };
      void save(source ? "mcp.sources.update" : "mcp.sources.create", source ? { ...shared, sourceId: source.sourceId, expectedRevision: source.revision } : { ...shared, namespace: text("namespace") }).then((result) => {
        if (result) onClose();
      });
    } catch {
      setInvalid("参数、环境变量和 header 需要合法的 JSON。");
    }
  }

  return (
    <Dialog
      open
      title={source ? "编辑 MCP 服务" : "添加 MCP 服务"}
      onClose={onClose}
      error={error ?? invalid}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={id} variant="primary" disabled={busy}>
            保存配置
          </Button>
        </>
      }
    >
      <form id={id} className="hu-stack" aria-label={source ? "编辑来源配置" : "添加来源配置"} onSubmit={submit}>
        <McpField label="服务名称">
          <input name="displayName" defaultValue={source?.displayName} required maxLength={128} autoFocus />
        </McpField>
        <McpField label="稳定命名空间">
          <input name="namespace" defaultValue={source?.namespace} required readOnly={!!source} maxLength={32} pattern="[a-z][a-z0-9]*(?:(?:-|_)[a-z0-9]+)*" />
        </McpField>
        <McpField label="传输">
          <select
            value={transport}
            onChange={(event) => {
              const next = event.currentTarget.value as typeof transport;
              setTransport(next);
              if (next !== "streamable-http" && auth === "oauth") setAuth("none");
            }}
          >
            {Object.entries(transportLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </McpField>
        {transport === "stdio" ? (
          <Fragment key="stdio">
            <McpField label="命令">
              <input name="command" defaultValue={stdio?.command} required />
            </McpField>
            <McpField label="参数（JSON 数组）">
              <textarea name="args" rows={3} defaultValue={JSON.stringify(stdio?.args ?? [])} spellCheck={false} />
            </McpField>
            <McpField label="工作目录">
              <input name="cwd" defaultValue={stdio?.cwd} />
            </McpField>
            <McpField label="环境变量引用（JSON）">
              <textarea name="environment" rows={3} defaultValue={JSON.stringify(stdio?.environment ?? {})} spellCheck={false} />
            </McpField>
            <p className="small muted">命令由 Engine 所在主机执行，首次检查前需授予本机执行许可。</p>
          </Fragment>
        ) : (
          <Fragment key="remote">
            <McpField label="远端 URL">
              <input name="url" type="url" defaultValue={remote?.url} required />
            </McpField>
            <McpField label="非秘密 header（JSON）">
              <textarea name="headers" rows={3} defaultValue={JSON.stringify(remote?.headers ?? {})} spellCheck={false} />
            </McpField>
            <McpField label="认证方式">
              <select value={auth} onChange={(event) => setAuth(event.currentTarget.value as typeof auth)}>
                <option value="none">无认证</option>
                <option value="environment">环境变量引用</option>
                <option value="credential-needed">静态模块凭据</option>
                {remote?.authentication.kind === "credential" ? <option value="credential">保留已绑定凭据</option> : null}
                {transport === "streamable-http" ? <option value="oauth">OAuth</option> : null}
              </select>
            </McpField>
            {auth === "environment" ? (
              <>
                <McpField label="环境变量名">
                  <input name="environmentName" defaultValue={remote?.authentication.kind === "environment" ? remote.authentication.name : ""} required pattern="[A-Za-z_][A-Za-z0-9_]*" />
                </McpField>
                <McpField label="认证 header">
                  <input name="header" defaultValue={remote?.authentication.kind === "environment" ? remote.authentication.header : "Authorization"} required />
                </McpField>
              </>
            ) : null}
          </Fragment>
        )}
      </form>
    </Dialog>
  );
}

export function McpImportDialog({ busy, error, onClose, run }: { busy: boolean; error: string | null; onClose(): void; run: Operation }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState<McpImportPreview | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  function clearPreview() {
    if (preview) void run("mcp.sources.importCancel", { previewId: preview.previewId });
    setPreview(null);
  }
  function close() {
    clearPreview();
    onClose();
  }
  async function previewImport() {
    if (preview) await run("mcp.sources.importCancel", { previewId: preview.previewId });
    const next = (await run("mcp.sources.importPreview", { text: draft })) as McpImportPreview | null;
    if (next) {
      setPreview(next);
      setChoices(Object.fromEntries(next.entries.map((entry) => [entry.entryId, entry.state === "ready" ? "create" : "skip"])));
    }
  }
  async function commit() {
    if (!preview) return;
    const selections = preview.entries.map((entry) => {
      const action = choices[entry.entryId] ?? "skip";
      return { entryId: entry.entryId, action, ...(action === "update" && { sourceId: entry.sourceId, sourceRevision: entry.sourceRevision }) };
    });
    if (await run("mcp.sources.importCommit", { previewId: preview.previewId, sourcesRevision: preview.sourcesRevision, selections })) onClose();
  }
  return (
    <Dialog
      open
      title="导入 MCP 配置"
      onClose={close}
      error={error}
      wide
      actions={
        <>
          <Button onClick={close} disabled={busy}>
            取消
          </Button>
          <Button type="submit" form={id} disabled={busy}>
            预览导入
          </Button>
          <Button variant="primary" disabled={busy || !preview || !Object.values(choices).some((value) => value !== "skip")} onClick={() => void commit()}>
            提交所选变更
          </Button>
        </>
      }
    >
      <form
        id={id}
        className="hu-stack"
        aria-label="导入来源配置"
        onSubmit={(event) => {
          event.preventDefault();
          void previewImport();
        }}
      >
        <McpField label="mcpServers JSON">
          <textarea
            rows={7}
            value={draft}
            required
            maxLength={131072}
            autoFocus
            spellCheck={false}
            onChange={(event) => {
              clearPreview();
              setDraft(event.currentTarget.value);
            }}
          />
        </McpField>
      </form>
      {preview ? (
        <section aria-label="导入预览" className="hu-stack">
          <h3>预览结果</h3>
          <ul>
            {preview.entries.map((entry) => (
              <li key={entry.entryId}>
                <strong>{entry.displayName ?? entry.namespace ?? "无效条目"}</strong>
                {entry.diagnostic ? <p>{entry.diagnostic}</p> : null}
                {entry.sensitive ? <p>原始认证内容将转存到本机凭据。</p> : null}
                {entry.state === "ready" || entry.state === "conflict" ? (
                  <McpField label={`处理 ${entry.namespace ?? "此来源"}`}>
                    <select value={choices[entry.entryId] ?? "skip"} onChange={(event) => setChoices({ ...choices, [entry.entryId]: event.currentTarget.value })}>
                      <option value="skip">跳过</option>
                      {entry.state === "ready" ? <option value="create">添加停用来源</option> : <option value="update">更新现有来源</option>}
                    </select>
                  </McpField>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Dialog>
  );
}
