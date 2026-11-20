import { Button } from "@huhu/ui";

export function WidgetReadStatus({ title, failed, retry }: { title?: string; failed: boolean; retry: () => void }) {
  return (
    <div className={title ? "hu-card-alt" : "hu-mini-empty"} aria-busy={!failed}>
      {title && <h2>{title}</h2>}
      {failed ? (
        <>
          <p role="alert">无法读取卡片数据</p>
          <Button onClick={retry}>重试</Button>
        </>
      ) : (
        <p>正在加载…</p>
      )}
    </div>
  );
}
