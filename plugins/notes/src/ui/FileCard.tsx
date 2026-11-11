import { FileQuestion } from "lucide-react";

const humanSize = (b: number): string => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GiB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MiB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KiB` : `${b} B`);

/** 非 Markdown 文件的元信息卡片：不尝试作为文本加载（ACC-KN-10），超大文件也不会卡住界面。 */
export function FileCard({ path, size, mtimeMs }: { path: string; size: number; mtimeMs: number }) {
  const name = path.split("/").at(-1) ?? path;
  const ext = name.includes(".") ? name.split(".").at(-1)!.toUpperCase() : "无扩展名";
  return (
    <section className="knowledge-document-area" data-testid="file-card">
      <div className="knowledge-document-toolbar">
        <div className="row grow">
          <span className="knowledge-breadcrumb">{path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "根目录"}</span>
          <span className="knowledge-filename">{name}</span>
        </div>
      </div>
      <div className="empty-state" style={{ margin: "auto" }}>
        <FileQuestion size={36} aria-hidden />
        <h3>{name}</h3>
        <dl className="knowledge-property-grid" style={{ textAlign: "left" }}>
          <div>
            <dt>类型</dt>
            <dd>{ext} 文件</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd data-testid="file-size">{humanSize(size)}</dd>
          </div>
          <div>
            <dt>修改</dt>
            <dd>{new Date(mtimeMs).toLocaleString("zh-CN", { hour12: false })}</dd>
          </div>
        </dl>
        <p className="hint-text">这不是 Markdown 笔记，HUHU 不会把它当作文本加载；请用对应的应用打开。</p>
      </div>
    </section>
  );
}
