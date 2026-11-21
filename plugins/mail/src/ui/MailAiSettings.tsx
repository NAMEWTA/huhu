import { Button } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useEngineEvents } from "@huhu/workbench";
import { useEffect, useId, useRef, useState } from "react";
import type { MailAiSettings as Settings } from "../engine/ai-settings.js";

const keyStates: Record<Settings["keyState"], string> = {
  unconfigured: "未配置",
  configured: "已配置",
  "temporarily-unavailable": "本机凭据暂不可用",
  "needs-reconfiguration": "此 Vault 需要重新配置 Key",
  corrupt: "本机凭据无法读取",
};
type Draft = Pick<Settings, "revision" | "enabled" | "endpoint" | "model"> & { keyMode: "keep" | "replace" | "clear"; keyValue: string };
const edit = ({ revision, enabled, endpoint, model }: Draft | Settings): Draft => ({ revision, enabled, endpoint, model, keyMode: "keep", keyValue: "" });

export function MailAiSettings({ readOnly, desktop }: { readOnly: boolean; desktop: boolean }) {
  const engine = useEngine();
  const settings = useCapability<Settings>("mail.ai.getSettings");
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState<"verify" | "save">();
  const [feedback, setFeedback] = useState("");
  const active = useRef<AbortController>(null);
  const addressHelp = useId();
  const saved = settings.data;
  const form = draft ?? (saved && edit(saved));
  const changedElsewhere = Boolean(draft && saved && draft.revision !== saved.revision);
  const canEdit = desktop && !readOnly && saved?.available === true;
  useEffect(() => () => active.current?.abort(), [engine]);
  useEngineEvents((event) => {
    if (event.type === "entity.changed" && "kind" in event.payload && event.payload.kind === "mail-ai-settings") void settings.refetch();
  });

  function update(values: Partial<Draft>) {
    if (!form) return;
    setDraft({ ...form, ...values });
    setFeedback("");
  }

  async function submit(action: "verify" | "save") {
    if (!form || !canEdit || changedElsewhere || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(action);
    setFeedback(action === "verify" ? "正在测试连接…" : "正在保存设置…");
    const input = {
      expectedRevision: form.revision,
      enabled: form.enabled,
      endpoint: form.endpoint,
      model: form.model,
      key: form.keyMode === "replace" ? { action: form.keyMode, value: form.keyValue } : { action: form.keyMode },
    };
    try {
      if (action === "verify") {
        await engine.call("mail.ai.verifyConnection", input, { write: true, signal: controller.signal });
        if (!controller.signal.aborted) setFeedback("连接测试通过。");
      } else {
        const result = await engine.call<Settings>("mail.ai.saveSettings", input, { write: true, signal: controller.signal });
        if (controller.signal.aborted) return;
        await settings.refetch();
        setDraft(undefined);
        setFeedback(form.enabled && !result.enabled ? "Key 已清除，邮件 AI 已关闭。" : "邮件 AI 设置已保存。");
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback(error instanceof CapabilityError ? error.message : "邮件 AI 操作失败。请检查连接后重试。");
        void settings.refetch();
      }
    } finally {
      active.current = null;
      setBusy(undefined);
    }
  }

  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void settings.refetch();
      }}
    >
      <summary>邮件 AI 设置</summary>
      {saved && (
        <p className="hu-mail-help">
          已保存 · {saved.enabled ? "启用" : "关闭"} · Key {keyStates[saved.keyState]}
          {saved.endpoint && (
            <>
              {" "}
              · {saved.endpoint} · {saved.model}
            </>
          )}
        </p>
      )}
      {saved && !desktop && <p>请在 Engine 主机的桌面工作台编辑邮件 AI 设置。</p>}
      {saved && desktop && !saved.available && <p>此主机的本机凭据存储不可用。</p>}
      {form && canEdit && (
        <form
          className="hu-mail-form"
          aria-label="邮件 AI 设置"
          onSubmit={(event) => {
            event.preventDefault();
            const button = (event.nativeEvent as SubmitEvent).submitter;
            void submit(button?.getAttribute("value") === "verify" ? "verify" : "save");
          }}
        >
          <label>
            <input type="checkbox" checked={form.enabled} disabled={!!busy} onChange={(event) => update({ enabled: event.currentTarget.checked })} /> 启用邮件 AI
          </label>
          <p className="hu-mail-help" id={addressHelp}>
            远端服务使用 HTTPS 和 Key。回环 HTTP 仅使用无 Key 连接。测试连接只发送合成消息。
          </p>
          <label>
            目标服务地址
            <input className="hu-input" type="url" required maxLength={2000} aria-describedby={addressHelp} disabled={!!busy} value={form.endpoint} onChange={(event) => update({ endpoint: event.currentTarget.value })} />
          </label>
          <label>
            模型
            <input className="hu-input" required maxLength={256} disabled={!!busy} value={form.model} onChange={(event) => update({ model: event.currentTarget.value })} />
          </label>
          <label>
            Key 操作
            <select
              className="hu-input"
              disabled={!!busy}
              value={form.keyMode}
              onChange={(event) => {
                const mode = event.currentTarget.value;
                if (mode === "keep" || mode === "replace" || mode === "clear") update({ keyMode: mode, keyValue: "" });
              }}
            >
              <option value="keep">保留</option>
              <option value="replace">替换</option>
              <option value="clear">清除</option>
            </select>
          </label>
          {form.keyMode === "replace" && (
            <label>
              新 API Key
              <input className="hu-input" type="password" autoComplete="new-password" required maxLength={4096} disabled={!!busy} value={form.keyValue} onChange={(event) => update({ keyValue: event.currentTarget.value })} />
            </label>
          )}
          <div className="hu-mail-row">
            <Button type="submit" value="save" disabled={!!busy || changedElsewhere}>
              保存 AI 设置
            </Button>
            <Button type="submit" value="verify" disabled={!!busy || changedElsewhere}>
              测试连接
            </Button>
            {changedElsewhere && (
              <Button
                type="button"
                onClick={() => {
                  setDraft(undefined);
                  setFeedback("");
                }}
              >
                载入已保存设置
              </Button>
            )}
          </div>
        </form>
      )}
      <p role="status">{changedElsewhere ? "已保存设置发生变化。请载入最新设置后编辑。" : settings.isError ? "无法读取邮件 AI 设置。" : feedback}</p>
    </details>
  );
}
