import { Badge } from "@huhu/ui";
import { BookOpen, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useCapability } from "../engine-client/react.js";
import { t } from "../i18n/zh-CN.js";
import { host } from "./host.js";

type AppInfo = Awaited<ReturnType<NonNullable<ReturnType<typeof host>>["appInfo"]>>;

/** 设置 → 关于与来源：版本与运行环境；开源声明（随应用打包的 THIRD_PARTY_NOTICES.md）。 */
export function AboutPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [notices, setNotices] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const core = useCapability<{ state: string; version: string | null }>("agent.core.status", {});
  useEffect(() => {
    const h = host();
    if (!h) {
      setNotices("");
      setUnavailable(true);
      return;
    }
    void h.appInfo().then(setInfo, () => undefined);
    void h.notices().then(setNotices, () => setNotices(""));
  }, []);
  const c = t.settings.about;
  const row = (label: string, value: string, testid: string) => (
    <div className="setting-row" key={testid}>
      <div>
        <strong>{label}</strong>
      </div>
      <code data-testid={testid}>{value}</code>
    </div>
  );
  return (
    <div data-testid="settings-about">
      <section className="card about-hero">
        <span className="about-mark">h</span>
        <div>
          <h1>HUHU Workbench</h1>
          <p>围绕 Vault 的本地工作台。</p>
          <div className="row">
            <Badge>{info ? `V${info.version}` : "桌面应用"}</Badge>
            <Badge>React 19</Badge>
            <Badge>本地优先</Badge>
          </div>
        </div>
      </section>
      <section className="settings-section card">
        <h2>{c.title}</h2>
        {unavailable ? (
          <p className="hint-text">{c.hostOnly}</p>
        ) : !info ? (
          <p>{t.loading}</p>
        ) : (
          <>
            {row(c.app, `${info.name} ${info.version}`, "about-version")}
            {info.commit ? row("构建", `${info.commit}${info.builtAt ? ` · ${info.builtAt.slice(0, 10)}` : ""}`, "about-build") : null}
            {row(c.platform, `${info.platform} / ${info.arch}`, "about-platform")}
            {row("Electron", info.electron, "about-electron")}
            {row("Chromium", info.chrome, "about-chrome")}
            {row("Node.js", info.node, "about-node")}
            {row("Herdr Core", core.data?.state === "connected" && core.data.version ? core.data.version : c.coreUnavailable, "about-herdr")}
          </>
        )}
      </section>
      <section className="settings-section card">
        <h2>学习与复用来源</h2>
        <p>完整路径、固定提交与采用边界见随应用的开源声明与架构文档。</p>
        <div className="source-link-list">
          {SOURCES.map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              <BookOpen size={15} aria-hidden />
              <span>
                <strong>{label}</strong>
                <code className="source-full-url">{url}</code>
              </span>
              <ExternalLink size={13} aria-hidden />
            </a>
          ))}
        </div>
      </section>
      <section className="settings-section card">
        <h2>{c.notices}</h2>
        {notices === null ? (
          <p>{t.loading}</p>
        ) : notices === "" ? (
          <p className="hint-text">{c.noNotices}</p>
        ) : (
          <details data-testid="about-notices">
            <summary>{c.showNotices}</summary>
            <pre className="tw-source-preview">{notices}</pre>
          </details>
        )}
      </section>
    </div>
  );
}

const SOURCES: [string, string][] = [
  ["obsidian-huhu · 文件管理、工作台与设计令牌", "https://github.com/NAMEWTA/obsidian-huhu"],
  ["SoloMD · Markdown 编辑体验", "https://github.com/zhitongblog/solomd"],
  ["DeepSeek Harness · Cordis 插件装配", "https://github.com/deepseek-ai/deepseek-harness"],
  ["Herdr Core · 终端会话引擎", "https://github.com/herdrdev/herdr-core"],
  ["OpenKnowledge · 编辑器、历史与统一能力调用", "https://github.com/inkeep/open-knowledge"],
  ["agent-autoloop · 最小内核、插件协议与恢复", "https://github.com/KKKKhazix/agent-autoloop"],
  ["Orca · Agent CLI 会话与注意力", "https://github.com/stablyai/orca"],
  ["Herdr App · 会话与终端视图", "https://github.com/herdrdev/herdr-app"],
  ["Pierre · Diff / Tree 适配候选", "https://github.com/pierrecomputer/pierre"],
  ["Atomic Editor · CM6 实时预览扩展", "https://github.com/kenforthewin/atomic-editor"],
  ["jsdiff · 差异算法", "https://github.com/kpdecker/jsdiff"],
  ["Electron · 进程模型与安全", "https://www.electronjs.org/docs/latest/tutorial/security"],
  ["CodeMirror 6 · 编辑器", "https://codemirror.net/"],
  ["xterm.js · 终端渲染", "https://github.com/xtermjs/xterm.js"],
  ["MCP TypeScript SDK · 协议实现", "https://github.com/modelcontextprotocol/typescript-sdk"],
  ["Radix Primitives · 弹层、开关与焦点管理", "https://www.radix-ui.com/primitives"],
  ["date-fns · 日期计算", "https://github.com/date-fns/date-fns"],
];
