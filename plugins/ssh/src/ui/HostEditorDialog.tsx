import { Button, Dialog, IconButton } from "@huhu/ui";
import { CapabilityError, host as desktopHost, useCapability, useEngine } from "@huhu/workbench";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";
import { purposes, type AuthKind, type ConfigureHost, type HostAuthSummary, type Purpose } from "../engine/auth-profile.js";
import { authLabels, credentialLabels, credentialState, type Host, type ManagedHost } from "./host-record.js";
import { t } from "./i18n.js";
import type { SshKeySummary } from "../shared/key-library.js";
import type { DraftConnectionResult } from "../shared/draft-connection.js";

function EditorField({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="hu-field">
      <label htmlFor={id} className="hu-field-label">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const initialTags = (host: ManagedHost | null) => host?.tags.join("，") ?? "";

export function HostEditorDialog({ editing, hosts, group, onClose, onSaved }: { editing: ManagedHost | null; hosts: readonly Host[]; group: string; onClose(): void; onSaved(hostId: string): Promise<void> }) {
  const engine = useEngine();
  const keys = useCapability<SshKeySummary[]>("ssh.keys.list", {}, { enabled: Boolean(desktopHost()) });
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const working = useRef(false);
  const picking = useRef(false);
  const [busy, setBusy] = useState(false);
  const [choosingFile, setChoosingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authKind, setAuthKind] = useState<AuthKind>(editing?.auth.kind ?? "password");
  const [keyId, setKeyId] = useState(editing?.keyId ?? "");
  const [values, setValues] = useState<Partial<Record<Purpose, string>>>({});
  const [cleared, setCleared] = useState<Partial<Record<Purpose, boolean>>>({});
  const [jump, setJump] = useState(editing?.jumpHostIds[0] ?? "");
  const [routeDisabled, setRouteDisabled] = useState(Boolean(editing?.routeDisabled));
  const draftRun = useRef<AbortController | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DraftConnectionResult | null>(null);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const storedKey = authKind === "key" && keyId !== "";
  const credentialPurposes = storedKey ? [] : purposes[authKind];
  const primaryPurpose = credentialPurposes[0];
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  useEffect(() => () => draftRun.current?.abort(), []);

  function clearTest() {
    draftRun.current?.abort();
    draftRun.current = null;
    setTesting(false);
    setTestResult(null);
  }

  function close() {
    if (working.current || picking.current) return;
    clearTest();
    onClose();
  }

  async function chooseIdentityFile() {
    if (picking.current) return;
    picking.current = true;
    setChoosingFile(true);
    try {
      const path = await desktopHost()?.pickOpenPath("file");
      if (path) {
        setValues((current) => ({ ...current, identityFile: path }));
        setError(null);
        clearTest();
      }
    } catch {
      setError("无法打开本机文件选择器，请重试或填写绝对路径。");
    } finally {
      picking.current = false;
      setChoosingFile(false);
    }
  }

  function readDraft(element: HTMLFormElement): ConfigureHost {
    const data = new FormData(element);
    const text = (field: string) => String(data.get(field) ?? "").trim();
    const tags = String(data.get("tags") ?? "");
    const interval = text("keepaliveIntervalSec");
    const count = text("keepaliveCountMax");
    const timeout = text("connectTimeoutSec");
    const credentials: ConfigureHost["credentials"] = [];
    for (const purpose of credentialPurposes) {
      const value = purpose === "identityFile" ? values[purpose]?.trim() : values[purpose];
      if (cleared[purpose]) credentials.push({ purpose, action: "clear" });
      else if (value) {
        credentials.push({ purpose, action: "replace", value, ...(editing?.authState[purpose] === "needs-reconfiguration" && { reconfigure: true }) });
      }
    }
    return {
      ...(editing && { hostId: editing.id }),
      expectedRevision: editing?.revision ?? null,
      name: text("name"),
      host: text("host"),
      user: text("user"),
      port: Number(text("port")),
      tags:
        editing && tags === initialTags(editing)
          ? editing.tags
          : [
              ...new Set(
                tags
                  .split(/[,，]/u)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            ],
      ...(timeout && { connectTimeoutSec: Number(timeout) }),
      ...(interval && { keepaliveIntervalSec: Number(interval) }),
      ...(count && { keepaliveCountMax: Number(count) }),
      jumpHostIds: jump ? [jump] : [],
      ...(jump && { routeDisabled }),
      authKind,
      ...(authKind === "key" && keyId !== (editing?.keyId ?? "") && { keyId: keyId || null }),
      credentials,
    };
  }

  async function testDraft() {
    const element = form.current;
    if (!element || working.current || picking.current || draftRun.current) return;
    const input = readDraft(element);
    if (!input.host || !input.user || input.port < 1 || input.port > 65535 || !Number.isInteger(input.port)) {
      setTestResult({ state: "failed", message: "请检查服务器地址、端口和用户名。" });
      return;
    }
    const run = new AbortController();
    draftRun.current = run;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await engine.call<DraftConnectionResult>("ssh.hosts.testDraft", { ...input, name: input.name || input.host }, { signal: run.signal });
      if (draftRun.current === run) setTestResult(result);
    } catch (reason) {
      if (draftRun.current === run) setTestResult({ state: "failed", message: reason instanceof Error ? reason.message : "测试连接失败。" });
    } finally {
      if (draftRun.current === run) {
        draftRun.current = null;
        setTesting(false);
      }
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current || picking.current) return;
    const input = readDraft(event.currentTarget);
    clearTest();
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await engine.call<z.output<typeof HostAuthSummary>>("ssh.hosts.configure", input, { write: true });
      await onSaved(result.hostId);
    } catch (e) {
      setError(e instanceof CapabilityError ? (e.code === "VERSION_CONFLICT" ? "主机配置已被其他操作更新。当前草稿已保留，请核对后关闭并重新打开编辑。" : e.message) : "无法确认保存结果。请核对主机目录。");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={editing ? "编辑 SSH 主机" : "新增 SSH 主机"}
      description="配置本机的 SSH 认证与主机连接资料。"
      testId="ssh-host-dialog"
      onClose={close}
      actions={
        <>
          <Button disabled={busy || choosingFile} onClick={close}>
            {t.cancel}
          </Button>
          <Button form={formId} type="submit" variant="primary" data-testid="ssh-host-save" loading={busy} disabled={choosingFile || (!editing && primaryPurpose !== undefined && !values[primaryPurpose])}>
            {editing ? t.save : t.newHost}
          </Button>
        </>
      }
    >
      <form
        ref={form}
        id={formId}
        method="post"
        className="hu-form-body ssh-host-form"
        onSubmit={(event) => void save(event)}
        onChange={() => {
          setError(null);
          clearTest();
        }}
      >
        {error ? (
          <p ref={errorSummary} role="alert" tabIndex={-1} className="hu-field-error">
            {error}
          </p>
        ) : null}
        <fieldset disabled={busy || choosingFile} className="ssh-host-fields">
          <legend className="hu-field-label">主机配置</legend>
          <div className="hu-field-grid">
            <EditorField label={t.hostName}>{(id) => <input id={id} name="name" required defaultValue={editing?.name} />}</EditorField>
            <EditorField label={t.address}>{(id) => <input id={id} name="host" required defaultValue={editing?.host} />}</EditorField>
            <EditorField label={t.user}>{(id) => <input id={id} name="user" required defaultValue={editing?.user} />}</EditorField>
            <EditorField label={t.port}>{(id) => <input id={id} name="port" type="number" min={1} max={65535} required defaultValue={editing?.port ?? 22} />}</EditorField>
          </div>
          <EditorField label="标签">{(id) => <input id={id} name="tags" placeholder="用逗号分隔" defaultValue={initialTags(editing)} />}</EditorField>
          {group ? <p className="hu-hint-text">当前分组：{group}</p> : null}
          <div className="hu-field" data-testid="ssh-jump-picker">
            {jump ? (
              <div className="row" data-testid="ssh-jump-item">
                <span className="hu-flex-fill">跳板：{hosts.find((host) => host.id === jump)?.name ?? jump}</span>
                <IconButton
                  icon={X}
                  label="移除跳板"
                  onClick={() => {
                    setJump("");
                    setRouteDisabled(false);
                    setError(null);
                    clearTest();
                  }}
                />
              </div>
            ) : (
              <EditorField label="添加跳板">
                {(id) => (
                  <select id={id} value="" onChange={(event) => setJump(event.target.value)}>
                    <option value="">直接连接</option>
                    {hosts
                      .filter((host) => host.id !== editing?.id && "revision" in host)
                      .map((host) => (
                        <option key={host.id} value={host.id}>
                          {host.name}（{host.host}）
                        </option>
                      ))}
                  </select>
                )}
              </EditorField>
            )}
          </div>
          {jump && (
            <label className="row">
              <input type="checkbox" checked={!routeDisabled} onChange={(event) => setRouteDisabled(!event.currentTarget.checked)} /> 启用跳板路由
            </label>
          )}
          <details
            className="hu-stack"
            onInvalid={(event) => {
              event.currentTarget.open = true;
            }}
          >
            <summary>高级连接设置</summary>
            <div className="hu-field-grid">
              <EditorField label="连接超时（秒）">{(id) => <input id={id} name="connectTimeoutSec" type="number" min={1} max={300} step="any" placeholder="使用库内默认值" defaultValue={editing?.connectTimeoutSec} />}</EditorField>
              <EditorField label="协议保活间隔（秒）">{(id) => <input id={id} name="keepaliveIntervalSec" type="number" min={0} max={3600} placeholder="使用库内默认值" defaultValue={editing?.keepaliveIntervalSec} />}</EditorField>
              <EditorField label="协议保活最大次数">{(id) => <input id={id} name="keepaliveCountMax" type="number" min={0} max={1000} placeholder="使用库内默认值" defaultValue={editing?.keepaliveCountMax} />}</EditorField>
            </div>
          </details>
        </fieldset>
        <fieldset disabled={busy || choosingFile} className="ssh-host-fields">
          <legend className="hu-field-label">本机认证</legend>
          <EditorField label="认证方式">
            {(id) => (
              <select
                id={id}
                value={authKind}
                onChange={(event) => {
                  setAuthKind(event.target.value as AuthKind);
                  setValues({});
                  setCleared({});
                }}
              >
                {Object.entries(authLabels).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </EditorField>
          {authKind === "agent" ? <p className="hu-hint-text">连接时检查本机系统 ssh-agent（SSH_AUTH_SOCK）。</p> : null}
          {authKind === "key" && (keys.data || keyId) && (
            <EditorField label="私钥来源">
              {(id) => (
                <select
                  id={id}
                  value={keyId}
                  onChange={(event) => {
                    setKeyId(event.target.value);
                    setValues({});
                    setCleared({});
                  }}
                >
                  <option value="">为此主机配置私钥</option>
                  {keyId && !keys.data?.some((key) => key.id === keyId) && <option value={keyId}>密钥库中的原密钥（不可用）</option>}
                  {keys.data?.map((key) => (
                    <option key={key.id} value={key.id} disabled={!key.available && key.id !== editing?.keyId}>
                      {key.name} · {key.keyType}
                      {key.available ? "" : " · 本机不可用"}
                    </option>
                  ))}
                </select>
              )}
            </EditorField>
          )}
          {credentialPurposes.map((purpose) => {
            const label = credentialLabels[purpose];
            const canClear = editing && editing.authState[purpose] && editing.authState[purpose] !== "unconfigured";
            const required = (!editing || Boolean(editing.keyId)) && purpose === primaryPurpose;
            const fieldValue = values[purpose] ?? "";
            return (
              <EditorField key={purpose} label={label}>
                {(id) => {
                  const props = {
                    id,
                    name: purpose,
                    value: fieldValue,
                    disabled: cleared[purpose],
                    required,
                    "aria-describedby": `${id}-state`,
                    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues((current) => ({ ...current, [purpose]: event.target.value })),
                  };
                  return (
                    <>
                      {purpose === "privateKey" ? (
                        <textarea {...props} rows={4} spellCheck={false} />
                      ) : (
                        <input {...props} type={purpose === "identityFile" ? "text" : "password"} autoComplete={purpose === "identityFile" ? "off" : "new-password"} />
                      )}
                      <div className="row">
                        <span id={`${id}-state`} className="hu-field-description hu-flex-fill">
                          {cleared[purpose] ? "保存时清空" : editing ? `${credentialState(editing, purpose)} · 留空保留` : purpose === "passphrase" ? "可选" : purpose === "identityFile" ? "填写本机绝对路径" : "必填"}
                        </span>
                        {purpose === "identityFile" ? (
                          <Button disabled={cleared[purpose]} onClick={() => void chooseIdentityFile()}>
                            选择本机文件
                          </Button>
                        ) : null}
                        {canClear ? (
                          <Button
                            onClick={() => {
                              setValues((current) => ({ ...current, [purpose]: "" }));
                              setCleared((current) => ({ ...current, [purpose]: !current[purpose] }));
                              setError(null);
                              clearTest();
                            }}
                          >
                            {cleared[purpose] ? `撤销清空${label}` : `清空${label}`}
                          </Button>
                        ) : null}
                      </div>
                    </>
                  );
                }}
              </EditorField>
            );
          })}
          {editing && editing.auth.kind !== authKind ? <p className="hu-hint-text">切换认证方式时，系统会清理旧方式专用的凭据。</p> : null}
        </fieldset>
        <div className="ssh-workspace-controls">
          {testing ? (
            <Button type="button" onClick={clearTest}>
              取消测试
            </Button>
          ) : (
            <Button type="button" disabled={busy || choosingFile} onClick={() => void testDraft()}>
              测试连接
            </Button>
          )}
          <span role="status">
            {testing
              ? "正在测试连接…"
              : testResult?.state === "authenticated"
                ? "测试成功，已通过认证。"
                : testResult?.state === "reachable"
                  ? `第 ${testResult.hop + 1} 跳可达，${testResult.reason === "host-key" ? "需要在正式连接时确认指纹" : "等待认证"}。`
                  : testResult?.state === "failed"
                    ? `${testResult.hop === undefined ? "" : `第 ${testResult.hop + 1} 跳 · `}${testResult.message}`
                    : ""}
          </span>
        </div>
      </form>
    </Dialog>
  );
}
