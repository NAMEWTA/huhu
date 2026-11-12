import { useEffect, useId, useState } from "react";

let loaded: Promise<typeof import("mermaid").default> | null = null;
/** Mermaid 较大：第一次遇到 mermaid 代码块时才加载；securityLevel=strict（图里的 HTML / 脚本被消毒，点击事件被禁用）。 */
function mermaidLib(): Promise<typeof import("mermaid").default> {
  loaded ??= import("mermaid").then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
    return m.default;
  });
  return loaded;
}

/** 阅读模式里的 ```mermaid 代码块 → 图表；解析错误显示在图的位置，不影响其余内容，源码仍可见。 */
export function MermaidBlock({ source }: { source: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSvg(null);
    setError(null);
    mermaidLib()
      .then((m) => m.render(id, source))
      .then((r) => alive && setSvg(r.svg))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      document.getElementById(id)?.remove(); // mermaid 解析失败时会在 body 里留下临时节点
    };
  }, [id, source]);
  if (error) {
    return (
      <div className="hu-mermaid hu-mermaid-error" role="alert" data-testid="mermaid-error">
        <p>Mermaid 图表有错误：{error.split("\n")[0]}</p>
        <pre>
          <code>{source}</code>
        </pre>
      </div>
    );
  }
  return svg ? <div className="hu-mermaid" data-testid="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="hu-mermaid hu-mermaid-loading">正在渲染图表…</div>;
}
