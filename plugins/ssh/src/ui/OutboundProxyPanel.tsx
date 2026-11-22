import { Button, Dialog } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useRef, useState, type FormEvent } from "react";
import type { ProxyProfile, ProxyRouting } from "../shared/outbound-proxy.js";
import { hostEndpoint } from "./HostKeyDialog.js";

const labels = { socks5: "SOCKS5", "http-connect": "HTTP CONNECT" } as const;

export function OutboundProxyPanel() {
  const engine = useEngine();
  const state = useCapability<{ profiles: ProxyProfile[]; routing: ProxyRouting }>("ssh.outboundProxies.list", {});
  const heading = useId();
  const form = useId();
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<ProxyProfile | null>();
  const [removing, setRemoving] = useState<ProxyProfile>();
  const [auth, setAuth] = useState("none");
  const [selected, setSelected] = useState<{ profileId: string; revision: string | null }>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string>();

  function edit(profile: ProxyProfile | null) {
    setAuth(profile?.authenticated ? "keep" : "none");
    setError(undefined);
    setEditor(profile);
  }

  async function save(capability: string, input: unknown, message: string, onSaved?: () => void) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setStatus("");
    setError(undefined);
    try {
      await engine.call(capability, input, { write: true });
      await state.refetch();
      onSaved?.();
      setStatus(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "无法保存 SSH 出站代理设置");
      await state.refetch();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "");
    const authentication = auth === "replace" ? { action: auth, username: value("username"), password: value("password") } : { action: auth };
    void save(
      "ssh.outboundProxies.save",
      {
        ...(editor && { id: editor.id }),
        expectedRevision: editor?.revision ?? null,
        name: value("name"),
        protocol: value("protocol"),
        host: value("host"),
        port: Number(value("port")),
        authentication,
      },
      "已保存出站代理。",
      () => setEditor(undefined),
    );
  }

  const profiles = state.data?.profiles ?? [];
  const currentDefault = state.data?.routing.defaultProfileId ?? "";
  const currentRevision = state.data?.routing.revision ?? null;
  const selectedDefault = selected?.profileId ?? currentDefault;
  const staleSelection = selected && selected.revision !== currentRevision;
  const selectedAvailable = !selectedDefault || profiles.some(({ id }) => id === selectedDefault);
  return (
    <section className="hu-card-alt hu-stack" aria-labelledby={heading}>
      <div className="ssh-workspace-controls">
        <h3 id={heading}>SSH 出站代理</h3>
        <Button type="button" disabled={saving || !state.data} onClick={() => edit(null)}>
          新增代理
        </Button>
      </div>
      <p>默认代理用于 SSH 的第一段 TCP 连接。有跳板时先连接首个跳板。单个主机可在编辑时选择直连或指定代理。</p>
      {state.isPending ? <p>正在读取代理设置…</p> : null}
      {state.isError ? (
        <div role="alert">
          无法读取代理设置。
          <Button type="button" onClick={() => void state.refetch()}>
            重试
          </Button>
        </div>
      ) : null}
      {state.data ? (
        <form
          method="post"
          aria-labelledby={heading}
          className="ssh-workspace-controls"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected && !staleSelection && selectedAvailable)
              void save("ssh.outboundProxies.setDefault", { defaultProfileId: selected.profileId || null, expectedRevision: selected.revision }, "已保存默认代理。", () => setSelected(undefined));
          }}
        >
          <label className="hu-field">
            Vault 默认出站代理
            <select name="proxy" value={selectedDefault} disabled={saving} onChange={(event) => setSelected({ profileId: event.currentTarget.value, revision: currentRevision })}>
              <option value="">直连</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
              {selectedDefault && !profiles.some(({ id }) => id === selectedDefault) ? <option value={selectedDefault}>原代理配置缺失</option> : null}
            </select>
          </label>
          <Button type="submit" loading={saving} disabled={currentDefault === selectedDefault || Boolean(staleSelection) || !selectedAvailable}>
            保存默认设置
          </Button>
          {staleSelection ? (
            <div className="hu-stack">
              <p role="status">当前默认设置已更新为 {currentDefault ? (profiles.find(({ id }) => id === currentDefault)?.name ?? "原代理配置缺失") : "直连"}。</p>
              <div className="ssh-workspace-controls">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelected(undefined);
                    setError(undefined);
                  }}
                >
                  使用当前设置
                </Button>
                <Button
                  type="button"
                  disabled={saving || !selectedAvailable}
                  onClick={() => {
                    setSelected({ profileId: selected.profileId, revision: currentRevision });
                    setError(undefined);
                  }}
                >
                  继续编辑所选设置
                </Button>
              </div>
            </div>
          ) : null}
        </form>
      ) : null}
      {profiles.length > 0 ? (
        <ul className="hu-stack">
          {profiles.map((profile) => (
            <li key={profile.id} className="ssh-workspace-controls">
              <strong>{profile.name}</strong>{" "}
              <span>
                {labels[profile.protocol]} · {hostEndpoint(profile)} · {profile.available ? "可用" : "本机凭据待配置"}
              </span>
              <Button type="button" disabled={saving} onClick={() => edit(profile)} aria-label={`编辑 ${profile.name}`}>
                编辑
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  setError(undefined);
                  setRemoving(profile);
                }}
                aria-label={`删除 ${profile.name}`}
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status">{status}</p>
      {error && editor === undefined && !removing ? (
        <p role="alert" className="hu-field-error">
          {error}
        </p>
      ) : null}
      {editor !== undefined ? (
        <Dialog
          open
          title={editor ? "编辑出站代理" : "新增出站代理"}
          error={error ?? null}
          onClose={() => {
            if (!busy.current) setEditor(undefined);
          }}
          actions={
            <>
              <Button type="button" disabled={saving} onClick={() => setEditor(undefined)}>
                取消
              </Button>
              <Button type="submit" form={form} variant="primary" loading={saving}>
                保存代理
              </Button>
            </>
          }
        >
          <form id={form} method="post" className="hu-stack" onSubmit={saveProfile}>
            <label className="hu-field">
              名称
              <input autoFocus name="name" defaultValue={editor?.name} maxLength={120} required />
            </label>
            <label className="hu-field">
              协议
              <select name="protocol" defaultValue={editor?.protocol ?? "socks5"}>
                <option value="socks5">SOCKS5</option>
                <option value="http-connect">HTTP CONNECT</option>
              </select>
            </label>
            <label className="hu-field">
              代理地址
              <input name="host" defaultValue={editor?.host} maxLength={253} required autoCapitalize="none" spellCheck={false} />
            </label>
            <label className="hu-field">
              代理端口
              <input name="port" type="number" min={1} max={65535} defaultValue={editor?.port} required />
            </label>
            <fieldset className="hu-stack">
              <legend>代理认证</legend>
              <label className="hu-field">
                凭据处理
                <select name="auth" value={auth} onChange={(event) => setAuth(event.currentTarget.value)}>
                  <option value="none">无需认证</option>
                  {editor?.authenticated ? <option value="keep">保留本机凭据</option> : null}
                  <option value="replace">填写代理账号和口令</option>
                </select>
              </label>
              {auth === "replace" ? (
                <>
                  <label className="hu-field">
                    代理账号
                    <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={255} required />
                  </label>
                  <label className="hu-field">
                    代理口令
                    <input name="password" type="password" autoComplete="new-password" maxLength={1024} required />
                  </label>
                </>
              ) : null}
              {auth !== "none" ? <p>凭据由本机加密保存。连接代理时，所选协议的代理认证在第一段链路上以未加密方式发送。</p> : null}
            </fieldset>
          </form>
        </Dialog>
      ) : null}
      {removing ? (
        <Dialog
          open
          title={`删除 ${removing.name}`}
          error={error ?? null}
          onClose={() => {
            if (!busy.current) setRemoving(undefined);
          }}
          actions={
            <>
              <Button type="button" autoFocus disabled={saving} onClick={() => setRemoving(undefined)}>
                取消
              </Button>
              <Button type="button" variant="danger" loading={saving} onClick={() => void save("ssh.outboundProxies.remove", { id: removing.id, revision: removing.revision }, "已删除出站代理。", () => setRemoving(undefined))}>
                删除代理
              </Button>
            </>
          }
        >
          <p>请先解除默认设置与主机关联。</p>
        </Dialog>
      ) : null}
    </section>
  );
}
