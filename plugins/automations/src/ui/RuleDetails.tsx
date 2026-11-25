import { Button } from "@huhu/ui";
import { ArrowRight, FileText, Search } from "lucide-react";
import { host, useCapability } from "@huhu/workbench";
import { useState } from "react";
import { type EditableRule } from "./RuleEditor.js";
import { TerminalEnvironment } from "./TerminalEnvironment.js";
import { t } from "./i18n.js";

interface Preview {
  next: string[];
  tasksDisabled: boolean;
  candidates: { taskId: string; title: string }[];
  skipped: { taskId: string; title: string; reason: keyof typeof t.reasons }[];
}
const actionLabel = (a: EditableRule["data"]["action"]): string => (a.kind === "agent" ? (a.input.source === "tasks" ? t.kinds.agent_tasks : t.kinds.agent_prompt) : a.kind === "terminal" ? t.kinds.terminal : t.kinds.reminder);

export function RuleDetails({ rule: cur }: { rule: EditableRule }) {
  const [preview, setPreview] = useState(false);
  const query = useCapability<Preview>("automations.preview", { id: cur.id, expectedVersion: cur.version });
  return (
    <>
      <div className="automations-rule-flow">
        <span>定时激活</span>
        <ArrowRight size={15} aria-hidden />
        <span>{actionLabel(cur.data.action)}</span>
        <ArrowRight size={15} aria-hidden />
        <span>记录结果</span>
      </div>
      {cur.data.action.kind === "agent" && cur.data.action.input.source === "tasks" ? (
        <div className="automations-scan-contract">
          <strong>{t.scanTitle}</strong>
          <p>{t.scanHintA}</p>
          <p>{t.scanHintB}</p>
          {cur.data.action.input.tags.length > 0 ? <p>标签筛选：{cur.data.action.input.tags.map((x) => `#${x}`).join(" ")}（全部匹配）</p> : null}
          {cur.body.trim() ? <pre className="hu-tw-source-preview">{cur.body.trim()}</pre> : null}
        </div>
      ) : cur.data.action.kind === "agent" ? (
        <section className="automations-markdown">
          <h3>固定需求</h3>
          <pre className="hu-tw-source-preview">{cur.body.trim() || "尚未配置内容。"}</pre>
        </section>
      ) : cur.data.action.kind === "terminal" ? (
        <section className="automations-markdown">
          <h3>命令</h3>
          <pre className="hu-tw-source-preview">{cur.data.action.command}</pre>
        </section>
      ) : (
        <section className="automations-markdown">
          <h3>提醒内容</h3>
          <p>{cur.data.action.text}</p>
        </section>
      )}
      {cur.data.action.kind === "terminal" && host() ? (
        cur.data.legacyEnvironment ? (
          <p role="status">旧终端环境需要重新配置。编辑并确认替换后，规则会暂停。</p>
        ) : (
          <TerminalEnvironment key={cur.id} ruleId={cur.id} showExternalApproval={cur.data.action.shell === "powershell" || cur.data.action.shell === "sh"} />
        )
      ) : null}
      <RuleSchedule next={query.data?.next} zone={cur.data.trigger.zone} />
      <div className="automations-rule-preview-action">
        <Button icon={Search} onClick={() => setPreview(true)}>
          {cur.data.action.kind === "agent" && cur.data.action.input.source === "tasks" ? "预览将处理的任务" : t.preview}
        </Button>
        <p>预览不写日志、不运行；立即运行才会记录一次激活。</p>
      </div>
      {preview && query.data ? (
        <div className="automations-scan-contract" data-testid="rule-preview">
          <strong>{t.next}</strong>
          <div className="automations-schedule-preview">
            {query.data.next.map((n) => (
              <time key={n} dateTime={n}>{new Date(n).toLocaleString("zh-CN", { timeZone: cur.data.trigger.zone, hour12: false, timeZoneName: "shortOffset" })}</time>
            ))}
          </div>
          {query.data.tasksDisabled ? <p>{t.tasksDisabled}</p> : null}
          <strong>
            {t.candidates} {query.data.candidates.length}
          </strong>
          <div className="automations-scan-list">
            {query.data.candidates.map((c) => (
              <div key={c.taskId} data-testid="preview-candidate">
                <FileText size={14} aria-hidden />
                <strong>{c.title}</strong>
              </div>
            ))}
          </div>
          <strong>
            {t.skipped} {query.data.skipped.length}
          </strong>
          <div className="automations-scan-list">
            {query.data.skipped.map((sk) => (
              <div key={sk.taskId} className="automations-scan-skipped" data-testid="preview-skipped">
                <strong>{sk.title}</strong>
                <small>{t.reasons[sk.reason] ?? sk.reason}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {preview && query.error ? <p role="alert">{query.error.message}</p> : null}
    </>
  );
}

/** 规则详情里常驻的“接下来的激活时间”（原型 SchedulePreview）：只预览，不写日志、不运行。 */
function RuleSchedule({ next, zone }: { next: string[] | undefined; zone: string }) {
  if (!next) return null;
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: zone || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="automations-schedule-preview" data-testid="rule-schedule">
      <strong>接下来的激活时间</strong>
      <small>{zone || "本地时区"} · 仅预览</small>
      {next.map((time) => (
        <time key={time} dateTime={time}>
          {fmt.format(new Date(time))}
        </time>
      ))}
    </div>
  );
}
