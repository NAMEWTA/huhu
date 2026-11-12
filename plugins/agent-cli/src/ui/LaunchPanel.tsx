import { ArrowRight, Check, Folder, Search, Zap } from "lucide-react";
import { useState } from "react";

export interface ModelOption {
  id: string;
  label: string;
  efforts: string[];
  fast: boolean;
}
export interface LaunchOptions {
  model?: string;
  effort?: string;
  fast?: boolean;
  prompt?: string;
}

/**
 * 启动设置面板（原型 v9-model-panel）：模型搜索与选择、推理深度、Fast、附加提示词，底部显示当前 Space 与“启动终端”。
 * 模型列表与每个模型支持的推理深度 / Fast 来自 Provider 检测结果（引擎的 providers.detect）。
 */
export function LaunchPanel({
  label,
  models,
  space,
  defaults,
  onStart,
}: {
  label: string;
  models: ModelOption[];
  space: { name: string; root: string } | null;
  defaults?: { model?: string; effort?: string; fast?: boolean } | undefined;
  onStart(o: LaunchOptions): void;
}) {
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<string | undefined>(models.find((m) => m.id === defaults?.model)?.id ?? models[0]?.id);
  const current = models.find((m) => m.id === model) ?? models[0];
  const efforts = current?.efforts ?? [];
  const [effort, setEffort] = useState<string | undefined>(efforts.includes(defaults?.effort ?? "") ? defaults?.effort : (efforts.at(-2) ?? efforts[0]));
  const [fast, setFast] = useState(false);
  const [prompt, setPrompt] = useState("");
  const shown = models.filter((m) => m.label.toLowerCase().includes(query.trim().toLowerCase()));
  const pick = (m: ModelOption) => {
    setModel(m.id);
    if (!m.efforts.includes(effort ?? "")) setEffort(m.efforts.at(-2) ?? m.efforts[0]);
    if (!m.fast) setFast(false);
  };
  return (
    <section className="v9-model-panel" aria-label={`${label} 启动设置`} data-testid="launch-panel">
      {models.length > 0 ? (
        <>
          <div className="v9-model-search">
            <Search size={15} aria-hidden />
            <input aria-label={`搜索 ${label} 模型`} placeholder={`搜索 ${label} 模型…`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="v9-model-list" role="listbox" aria-label={`${label} 模型`}>
            {shown.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={current?.id === m.id} className={current?.id === m.id ? "selected" : ""} onClick={() => pick(m)}>
                <span>{m.label}</span>
                {current?.id === m.id ? <Check size={14} aria-hidden /> : null}
              </button>
            ))}
            {shown.length === 0 ? <p className="v9-small-empty">没有匹配的模型</p> : null}
          </div>
        </>
      ) : null}
      <div className="v9-launch-options">
        {efforts.length > 0 ? (
          <div className="v9-effort" role="group" aria-label="推理深度">
            {efforts.map((e) => (
              <button key={e} type="button" aria-pressed={effort === e} onClick={() => setEffort(e)}>
                {e}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        {current?.fast ? (
          <button type="button" className="v9-fast" aria-pressed={fast} onClick={() => setFast(!fast)}>
            <Zap size={12} aria-hidden />
            Fast
          </button>
        ) : null}
      </div>
      <textarea className="v9-launch-prompt" aria-label="附加提示词" placeholder="附加提示词（可选）" value={prompt} rows={2} onChange={(e) => setPrompt(e.target.value)} />
      <div className="v9-launch-footer">
        <span title={space?.root}>
          <Folder size={13} aria-hidden />
          {space?.name}
        </span>
        <button
          type="button"
          className="v9-start"
          data-testid="launch-start"
          onClick={() => onStart({ ...(current ? { model: current.id } : {}), ...(effort ? { effort } : {}), ...(fast ? { fast: true } : {}), ...(prompt.trim() ? { prompt: prompt.trim() } : {}) })}
        >
          <ArrowRight size={14} aria-hidden />
          启动终端
        </button>
      </div>
    </section>
  );
}
