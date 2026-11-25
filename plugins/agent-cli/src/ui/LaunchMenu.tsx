import { IconButton, Popover } from "@huhu/ui";
import { scoreText } from "@huhu/workbench";
import { ArrowLeft, ChevronLeft, Search, Settings2 } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AGENT_CATALOG, isEnabled, type AgentCatalogEntry, type AgentSettingsFile } from "../shared/index.js";
import { AgentIcon } from "./AgentIcon.js";
import type { AgentEnvironmentApproval } from "../engine/interactive-environment.js";

export interface LaunchOptions {
  model?: string;
  effort?: string;
  fast?: boolean;
  prompt?: string;
  environment?: AgentEnvironmentApproval;
}
export interface Detected {
  id: string;
  displayName: string;
  installed: boolean;
}

export function LaunchMenu({
  trigger,
  detected,
  settings,
  onLaunch,
  onOpenSettings,
  onOpenEnvironment,
  onClose,
}: {
  trigger: HTMLButtonElement;
  detected: Detected[];
  settings: AgentSettingsFile;
  onLaunch(provider: string, o?: LaunchOptions): void;
  onOpenSettings(): void;
  onOpenEnvironment?: (() => void) | undefined;
  onClose(restoreFocus?: boolean): void;
}) {
  const [provider, setProvider] = useState<AgentCatalogEntry["id"] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = useRef(trigger);
  const focusPanel = useRef(false);
  const panelId = useId();
  const enabled = AGENT_CATALOG.filter((entry) => isEnabled(settings, entry.id));
  const installed = new Set(detected.filter((entry) => entry.installed).map((entry) => entry.id));
  const first = enabled.find(({ id }) => id === settings.defaultAgent) ?? enabled.find(({ id }) => installed.has(id));
  const ordered = first ? [first, ...enabled.filter((entry) => entry !== first)] : enabled;
  const entry = ordered.find(({ id }) => id === provider && installed.has(id));
  const activeProvider = entry?.id;

  const focusConfiguration = () => panel.current?.querySelector<HTMLElement>("[data-launch-initial]")?.focus({ preventScroll: true });
  useLayoutEffect(() => {
    if (activeProvider && focusPanel.current) {
      focusConfiguration();
      focusPanel.current = false;
    }
    if (provider && !activeProvider) {
      setProvider(null);
      focusPanel.current = false;
      list.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [activeProvider, provider]);

  const back = () => {
    list.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus({ preventScroll: true });
    setProvider(null);
    focusPanel.current = false;
  };
  function openProvider(id: AgentCatalogEntry["id"], focus: boolean) {
    if (id === provider) {
      if (focus) focusConfiguration();
      return;
    }
    if (!focus && panel.current?.contains(document.activeElement)) return;
    focusPanel.current = focus;
    setProvider(id);
  }
  const movingMouse = (event: PointerEvent) => event.pointerType === "mouse" && (event.movementX !== 0 || event.movementY !== 0);

  return (
    <Popover.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          className="agent-launcher"
          aria-label="启动 Agent"
          data-configuring={Boolean(entry)}
          align="end"
          sideOffset={5}
          collisionPadding={8}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && trigger.contains(event.target)) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            if (event.isComposing || event.keyCode === 229) return;
            event.stopPropagation();
            if (entry) back();
            else onClose();
          }}
        >
          <div className="agent-launch-menu" data-testid="launch-menu">
            <div className="agent-launch-menu-list" ref={list}>
              <button type="button" className="agent-launch-menu-row" data-testid="launch-shell" onClick={() => onLaunch("shell")}>
                <AgentIcon id="shell" />
                <span className="hu-flex-fill">新终端</span>
                <kbd>Ctrl+T</kbd>
              </button>
              {ordered.map((agent) => {
                const available = installed.has(agent.id);
                const expanded = agent.id === activeProvider;
                return (
                  <button
                    key={agent.id}
                    type="button"
                    className="agent-launch-menu-row"
                    aria-expanded={available ? expanded : undefined}
                    aria-controls={expanded ? panelId : undefined}
                    disabled={!available}
                    data-testid="launch-agent"
                    data-agent={agent.id}
                    title={available ? undefined : "未检测到，请在智能体设置中检查命令"}
                    onPointerMove={(event) => {
                      if (available && movingMouse(event)) openProvider(agent.id, false);
                    }}
                    onClick={() => openProvider(agent.id, true)}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowRight" || event.nativeEvent.isComposing) return;
                      event.preventDefault();
                      openProvider(agent.id, true);
                    }}
                  >
                    <AgentIcon id={agent.id} />
                    <span className="hu-flex-fill">{agent.displayName}</span>
                    {available ? <ChevronLeft size={14} aria-hidden /> : <span className="agent-launch-menu-tag">未检测到</span>}
                  </button>
                );
              })}
              {onOpenEnvironment ? (
                <button type="button" className="agent-launch-menu-row" onClick={onOpenEnvironment}>
                  使用启动环境…
                </button>
              ) : null}
              <button type="button" className="agent-launch-menu-row" data-testid="launch-open-settings" onClick={onOpenSettings}>
                <Settings2 size={16} aria-hidden />
                <span className="hu-flex-fill">智能体设置…</span>
              </button>
            </div>
            {entry ? (
              <div
                key={entry.id}
                id={panelId}
                ref={panel}
                className="agent-launch-menu-sub"
                role="group"
                aria-label={entry.displayName}
                data-testid="launch-submenu"
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" || event.nativeEvent.isComposing || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
                  event.preventDefault();
                  back();
                }}
              >
                <LaunchConfiguration entry={entry} settings={settings} onBack={back} onLaunch={(options) => onLaunch(entry.id, options)} />
              </div>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function LaunchConfiguration({ entry, settings, onBack, onLaunch }: { entry: AgentCatalogEntry; settings: AgentSettingsFile; onBack(): void; onLaunch(options: LaunchOptions): void }) {
  const user = settings.agents[entry.id];
  const models = entry.options.model ? (entry.options.models ?? []) : [];
  const [query, setQuery] = useState("");
  const [model, setModel] = useState<string>();
  const [effort, setEffort] = useState<string>();
  const [fast, setFast] = useState<boolean>();
  const [prompt, setPrompt] = useState("");
  const radioGroup = useId();
  const current = models.find(({ id }) => id === model) ?? models.find(({ id }) => id === user?.model);
  const efforts = entry.options.effort ? (current?.efforts ?? []) : [];
  const configuredEffort = user?.effort && efforts.includes(user.effort) ? user.effort : undefined;
  const selectedEffort = effort && efforts.includes(effort) ? effort : undefined;
  const canFast = Boolean(entry.options.fast && current?.fast);
  const selectedFast = fast ?? user?.fast ?? false;
  const matches = models.filter((item) => !query.trim() || scoreText(query, item.label) >= 0 || scoreText(query, item.id) >= 0);

  function selectModel(id: string) {
    const next = models.find((item) => item.id === id);
    if (!next) return;
    setModel(next.id);
    if (effort && !next.efforts.includes(effort)) setEffort(undefined);
    if (!next.fast) setFast(undefined);
  }
  function searchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || event.keyCode === 229 || !matches[0]) return;
    event.preventDefault();
    selectModel(matches[0].id);
  }

  return (
    <>
      <div className="agent-launch-menu-heading">
        <strong>{entry.displayName}</strong>
        <IconButton icon={ArrowLeft} label="返回 Agent 列表" data-launch-initial={models.length === 0 ? "" : undefined} onClick={onBack} />
      </div>
      {models.length > 0 ? (
        <>
          <label className="agent-launch-menu-search">
            <Search size={14} aria-hidden />
            <input type="search" aria-label="搜索模型" placeholder="搜索模型…" data-launch-initial="" data-testid="launch-menu-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={searchKey} />
          </label>
          <div className="agent-launch-models" role="radiogroup" aria-label="模型">
            {matches.map((item) => (
              <label key={item.id}>
                <input type="radio" name={radioGroup} checked={current?.id === item.id} onChange={() => selectModel(item.id)} />
                <span>{item.label}</span>
              </label>
            ))}
            {matches.length === 0 ? (
              <p className="agent-launch-menu-hint" role="status">
                没有匹配的模型
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {efforts.length > 0 ? (
        <label className="agent-launch-field">
          推理档位
          <select value={selectedEffort ?? ""} onChange={(event) => setEffort(event.target.value || undefined)}>
            <option value="">{configuredEffort ? `使用设置（${configuredEffort}）` : "使用设置"}</option>
            {efforts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {canFast ? (
        <label className="agent-launch-fast">
          <input type="checkbox" checked={selectedFast} onChange={(event) => setFast(event.target.checked)} />
          速度：Fast
        </label>
      ) : null}
      {entry.interactive.prompt === "positional" ? (
        <label className="agent-launch-field">
          附加提示词
          <textarea rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="可选" />
        </label>
      ) : null}
      <button
        type="button"
        className="hu-btn hu-btn-primary"
        data-testid="launch-submenu-start"
        onClick={() =>
          onLaunch({
            ...(current ? { model: current.id } : {}),
            ...(selectedEffort ? { effort: selectedEffort } : {}),
            ...(canFast ? { fast: selectedFast } : {}),
            ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
          })
        }
      >
        启动
      </button>
    </>
  );
}
