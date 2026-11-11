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
    <>
      <dt>{label}</dt>
      <dd data-testid={testid}>{value}</dd>
    </>
  );
  return (
    <div data-testid="settings-about">
      <h1>{c.title}</h1>
      {unavailable ? (
        <p className="hu-meta">{c.hostOnly}</p>
      ) : !info ? (
        <p>{t.loading}</p>
      ) : (
        <dl>
          {row(c.app, `${info.name} ${info.version}`, "about-version")}
          {row(c.platform, `${info.platform} / ${info.arch}`, "about-platform")}
          {row("Electron", info.electron, "about-electron")}
          {row("Chromium", info.chrome, "about-chrome")}
          {row("Node.js", info.node, "about-node")}
          {row("Herdr Core", core.data?.state === "connected" && core.data.version ? core.data.version : c.coreUnavailable, "about-herdr")}
        </dl>
      )}
      <h2>{c.notices}</h2>
      {notices === null ? (
        <p>{t.loading}</p>
      ) : notices === "" ? (
        <p className="hu-meta">{c.noNotices}</p>
      ) : (
        <details data-testid="about-notices">
          <summary>{c.showNotices}</summary>
          <pre style={{ maxHeight: "50vh", overflow: "auto", whiteSpace: "pre-wrap" }}>{notices}</pre>
        </details>
      )}
    </div>
  );
}
