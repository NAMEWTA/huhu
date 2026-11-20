import { Button, Dialog } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { Plus, Trash2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import type { AgentEnvironmentProfile } from "../engine/launch-environment.js";
import { AGENT_CATALOG } from "../shared/catalog.js";

const listCapability = "agent.launch.environments.list";
const providers = [...AGENT_CATALOG.map(({ id, displayName }) => ({ id, label: displayName })), { id: "shell", label: "终端" }] as const;
const labels: Record<string, string> = {
  unconfigured: "未配置",
  configured: "已配置",
  "temporarily-unavailable": "本机暂不可用",
  "needs-reconfiguration": "需要重新配置",
  corrupt: "配置无法读取",
};

type Profile = AgentEnvironmentProfile;
type Variable = { id: number; name: string; value: string; protected: boolean; clear: boolean; reconfigure: boolean };

export function AgentEnvironmentSettings() {
  const engine = useEngine();
  const desktop = Boolean(host());
  const list = useCapability<{ localAvailable: boolean; profiles: Profile[] }>(listCapability, {}, { enabled: desktop });
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const [deletingNow, setDeletingNow] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  if (!desktop) return null;

  async function remove() {
    if (!deleting || deletingNow) return;
    setDeletingNow(true);
    setRemoveError(null);
    try {
      await engine.call("agent.launch.environments.remove", { id: deleting.id, expectedRevision: deleting.revision }, { write: true });
      await list.refetch();
      setDeleting(null);
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeletingNow(false);
    }
  }
  return (
    <section className="hu-settings-section hu-card-alt" data-testid="agent-environment-settings">
      <div className="row">
        <h2 className="grow">启动环境</h2>
        <Button icon={Plus} disabled={!list.data?.localAvailable} onClick={() => setEditing("new")}>
          新建启动环境
        </Button>
      </div>
      {list.isError ? <p role="alert">{list.error.message}</p> : null}
      {list.data && !list.data.localAvailable ? <p className="hu-hint-text">当前 Vault 的本机凭据保护不可用。</p> : null}
      {list.data?.profiles.map((profile) => (
        <div key={profile.id} className="hu-setting-row">
          <div>
            <strong>{profile.name}</strong>
            <p>{providers.find(({ id }) => id === profile.provider)?.label ?? profile.provider}</p>
            {profile.protectedNames.map((name) => (
              <p key={name}>
                {name} · {labels[profile.states[name] ?? "unconfigured"]}
              </p>
            ))}
          </div>
          <div className="row">
            <Button onClick={() => setEditing(profile)} aria-label={`编辑启动环境 ${profile.name}`}>
              编辑
            </Button>
            <Button
              icon={Trash2}
              variant="ghost"
              aria-label={`删除启动环境 ${profile.name}`}
              onClick={() => {
                setRemoveError(null);
                setDeleting(profile);
              }}
            >
              删除
            </Button>
          </div>
        </div>
      ))}
      {editing ? (
        <EnvironmentForm
          key={editing === "new" ? "new" : editing.id}
          profile={editing === "new" ? null : editing}
          close={() => setEditing(null)}
          saved={() => {
            setEditing(null);
            void list.refetch();
          }}
        />
      ) : null}
      {deleting ? (
        <Dialog
          open
          title={`删除“${deleting.name}”？`}
          error={removeError}
          onClose={() => {
            if (!deletingNow) setDeleting(null);
          }}
          actions={
            <>
              <Button disabled={deletingNow} onClick={() => setDeleting(null)}>
                取消
              </Button>
              <Button variant="danger" loading={deletingNow} onClick={() => void remove()}>
                删除启动环境
              </Button>
            </>
          }
        >
          <p>删除此配置及其本机保护值。</p>
        </Dialog>
      ) : null}
    </section>
  );
}

function EnvironmentForm({ profile, close, saved }: { profile: Profile | null; close(): void; saved(): void }) {
  const engine = useEngine();
  const form = useId();
  const [name, setName] = useState(profile?.name ?? "");
  const [provider, setProvider] = useState<Profile["provider"]>(profile?.provider ?? "codex");
  const [sequence, setSequence] = useState(256);
  const [rows, setRows] = useState<Variable[]>(() => [
    ...(profile?.ordinary ?? []).map((item, id) => ({ ...item, id, protected: false, clear: false, reconfigure: false })),
    ...(profile?.protectedNames ?? []).map((name, id) => ({ id: id + 128, name, value: "", protected: true, clear: false, reconfigure: false })),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (id: number, changes: Partial<Variable>) => setRows((previous) => previous.map((row) => (row.id === id ? { ...row, ...changes } : row)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const protectedRows = rows.filter((row) => row.protected);
    const ordinary = rows.filter((row) => !row.protected).map(({ name, value }) => ({ name, value }));
    const protectedNames = protectedRows.map(({ name }) => name);
    const changes = [
      ...(profile?.protectedNames ?? []).filter((key) => !protectedNames.includes(key)).map((name) => ({ name, action: "clear" })),
      ...protectedRows.flatMap((row) => (row.clear ? [{ name: row.name, action: "clear" }] : row.value ? [{ name: row.name, action: "replace", value: row.value, ...(row.reconfigure && { reconfigure: true }) }] : [])),
    ];
    setBusy(true);
    setError(null);
    try {
      await engine.call(
        "agent.launch.environments.save",
        {
          ...(profile && { id: profile.id }),
          expectedRevision: profile?.revision ?? null,
          name: name.trim(),
          provider,
          ordinary,
          protectedNames,
          changes,
        },
        { write: true },
      );
      saved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={profile ? "编辑启动环境" : "新建启动环境"}
      wide
      error={error}
      onClose={() => {
        if (!busy) close();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            取消
          </Button>
          <Button type="submit" form={form} variant="primary" loading={busy}>
            保存启动环境
          </Button>
        </>
      }
    >
      <form id={form} autoComplete="off" onSubmit={(event) => void submit(event)}>
        <label className="hu-field" htmlFor={`${form}-name`}>
          <span>环境名称</span>
          <input id={`${form}-name`} autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="hu-field" htmlFor={`${form}-provider`}>
          <span>智能体</span>
          <select id={`${form}-provider`} disabled={busy} value={provider} onChange={(event) => setProvider(event.target.value as Profile["provider"])}>
            {providers.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {rows.map((row, index) => {
          const name = `${form}-name-${row.id}`;
          const value = `${form}-value-${row.id}`;
          return (
            <fieldset key={row.id} disabled={busy}>
              <legend>
                {row.protected ? "保护变量" : "普通变量"} {index + 1}
              </legend>
              <label className="hu-field" htmlFor={name}>
                <span>变量名</span>
                <input id={name} required pattern="[A-Za-z_][A-Za-z0-9_]*" maxLength={128} value={row.name} onChange={(event) => edit(row.id, { name: event.target.value })} />
              </label>
              <label className="hu-field" htmlFor={value}>
                <span>{row.protected ? "替换保护值" : "变量值"}</span>
                <input id={value} type={row.protected ? "password" : "text"} maxLength={16384} disabled={row.clear} value={row.value} onChange={(event) => edit(row.id, { value: event.target.value })} />
              </label>
              {row.protected ? (
                <div className="row">
                  <label>
                    <input type="checkbox" checked={row.clear} onChange={(event) => edit(row.id, { clear: event.target.checked, value: "" })} /> 清除本机值
                  </label>
                  {row.value && profile?.states[row.name] === "needs-reconfiguration" ? (
                    <label>
                      <input type="checkbox" checked={row.reconfigure} onChange={(event) => edit(row.id, { reconfigure: event.target.checked })} /> 重新配置本机值
                    </label>
                  ) : null}
                </div>
              ) : null}
              <Button variant="ghost" onClick={() => setRows((previous) => previous.filter(({ id }) => id !== row.id))}>
                移除变量
              </Button>
            </fieldset>
          );
        })}
        <div className="row">
          {[false, true].map((protectedValue) => (
            <Button
              key={String(protectedValue)}
              icon={Plus}
              disabled={busy || rows.filter((row) => row.protected === protectedValue).length >= 64}
              onClick={() => {
                setSequence(sequence + 1);
                setRows((previous) => [...previous, { id: sequence, name: "", value: "", protected: protectedValue, clear: false, reconfigure: false }]);
              }}
            >
              {protectedValue ? "添加保护变量" : "添加普通变量"}
            </Button>
          ))}
        </div>
      </form>
    </Dialog>
  );
}
