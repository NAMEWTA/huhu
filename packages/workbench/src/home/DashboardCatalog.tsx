import { homeWidgetType, type DashboardBoard, type HomeWidgetDefinition } from "@huhu/contracts";
import { Button, Dialog, Select } from "@huhu/ui";
import { useId, useState } from "react";

type Instance = DashboardBoard["instances"][number];

interface DashboardCatalogProps {
  definitions: ReadonlyMap<string, HomeWidgetDefinition>;
  instances: readonly Instance[];
  allowed(type: string): boolean;
  unavailableReason(type: string): string;
  sourceName(owner: string): string;
  onAdd(definition: HomeWidgetDefinition): void;
  onRestore(instance: Instance): void;
  onClose(): void;
}

export function DashboardCatalog({ definitions, instances, allowed, unavailableReason, sourceName, onAdd, onRestore, onClose }: DashboardCatalogProps) {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const catalogueId = useId();
  const query = search.trim().toLocaleLowerCase();
  const candidates = [...definitions.values()].filter((definition) => {
    const system = definition.owner === "kernel";
    const text = `${definition.title} ${definition.description} ${sourceName(definition.owner)} ${definition.owner}`;
    return (source === "all" || (source === "system") === system) && text.toLocaleLowerCase().includes(query);
  });

  return (
    <Dialog open wide title="添加卡片" onClose={onClose}>
      <div role="search" aria-label="卡片目录" className="hu-dashboard-catalog-filters">
        <input className="hu-input" type="search" aria-label="搜索卡片" placeholder="搜索卡片" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select aria-label="卡片来源" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">全部来源</option>
          <option value="system">工作台</option>
          <option value="plugin">插件</option>
        </Select>
      </div>
      {!candidates.length ? <p role="status">没有符合条件的卡片。</p> : null}
      <div className="hu-dashboard-catalog">
        {candidates.map((definition) => {
          const type = homeWidgetType(definition.owner, definition.id);
          const titleId = `${catalogueId}-${type}`;
          const existing = instances.filter((instance) => instance.widgetType === type);
          const hidden = existing.filter((instance) => instance.hidden);
          const available = allowed(type);
          const canAdd = definition.maxInstances === null || existing.length < definition.maxInstances;
          const action = !available ? "当前不可用" : !canAdd ? "已添加" : existing.length ? "再添加一个" : "添加";
          return (
            <article className="hu-card-alt hu-dashboard-catalog-card" key={type} aria-labelledby={titleId}>
              <header>
                <h3 id={titleId}>{definition.title}</h3>
                <small>{sourceName(definition.owner)}</small>
              </header>
              <p>{definition.description}</p>
              <p className="hu-dashboard-catalog-size">
                推荐尺寸 {definition.defaultSize.w} × {definition.defaultSize.h}
              </p>
              {!available ? <p>{unavailableReason(type)}</p> : null}
              {existing.length > 0 && (canAdd || hidden.length > 0) ? (
                <p>
                  已有 {existing.length} 个{hidden.length ? `，其中 ${hidden.length} 个隐藏` : ""}
                </p>
              ) : null}
              <footer className="hu-dashboard-catalog-actions">
                {available &&
                  hidden.map((instance, index) => {
                    const label = `恢复隐藏卡片 ${instance.title || definition.title}${hidden.length > 1 ? `（${index + 1}）` : ""}`;
                    return (
                      <Button key={instance.instanceId} aria-label={label} onClick={() => onRestore(instance)}>
                        恢复隐藏卡片
                      </Button>
                    );
                  })}
                {(!available || canAdd || hidden.length === 0) && (
                  <Button aria-label={`${action} ${definition.title}`} variant="primary" disabled={!available || !canAdd} onClick={() => onAdd(definition)}>
                    {action}
                  </Button>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </Dialog>
  );
}
