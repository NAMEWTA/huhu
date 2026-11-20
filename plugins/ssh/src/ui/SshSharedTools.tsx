import type { CapabilityCatalogEntry, ToolAccessSnapshot } from "@huhu/contracts";
import { Button, SearchBox } from "@huhu/ui";
import { host, useCapability, useEngine } from "@huhu/workbench";
import { useState } from "react";

type Gateway = { mcp: { enabled: boolean; transport: "stdio" | "http" }; toolAccess: ToolAccessSnapshot };
type Activity = { at: string; entry: string; capability: string; code: string };

const reasons: Record<CapabilityCatalogEntry["availability"], string> = {
  active: "",
  "plugin-disabled": "插件已停用",
  "plugin-failed": "插件启动失败",
  "handler-missing": "能力处理函数尚未注册",
};

function toolStatus(tool: CapabilityCatalogEntry, policy: ToolAccessSnapshot, mcpEnabled: boolean) {
  if (tool.availability !== "active") return reasons[tool.availability];
  if (!tool.exposable) return "仅供工作台使用";
  if (policy.state !== "ready") return "公共工具策略不可读";
  if (!tool.exposed) return "工具未开放";
  return mcpEnabled ? "已开放" : "已开放，MCP 已关闭";
}

export function SshSharedTools() {
  const bridge = host();
  const desktop = Boolean(bridge);
  const engine = useEngine();
  const gateway = useCapability<Gateway>("gateway.get", {}, { enabled: desktop });
  const catalog = useCapability<CapabilityCatalogEntry[]>("capabilities.list", { includeInactive: true }, { enabled: desktop });
  const audit = useCapability<Activity[]>("gateway.audit.list", {}, { enabled: desktop });
  const [notice, setNotice] = useState<"copied" | "failed">();
  const [filter, setFilter] = useState("");

  if (!desktop) return <p>在桌面应用的能力网关中管理工具权限与服务。</p>;
  if (gateway.isError || catalog.isError) return <p role="alert">无法读取公共工具策略或能力目录。</p>;
  if (!gateway.data || !catalog.data) return <p role="status">正在读取能力网关…</p>;
  const { mcp, toolAccess } = gateway.data;
  const ssh = catalog.data.filter(({ plugin }) => plugin === "ssh");
  const matches = ssh.filter(({ name, title }) => `${name} ${title ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const active = ssh.some(({ availability }) => availability === "active");
  const recent = (audit.data ?? []).filter(({ capability }) => capability.startsWith("ssh.") || capability.startsWith("ssh_")).slice(0, 10);
  const stdio = JSON.stringify({ mcpServers: { huhu: { command: "huhu", args: ["mcp", "--vault", "<当前库路径>"] } } }, null, 2);
  const http = JSON.stringify({ mcpServers: { huhu: { url: `${engine.endpoint.baseUrl}/mcp`, headers: { Authorization: "Bearer <在能力网关创建的令牌>" } } } }, null, 2);

  async function copy(text: string) {
    try {
      await bridge!.copyText(text);
      setNotice("copied");
    } catch {
      setNotice("failed");
    }
  }

  return (
    <section className="hu-settings-section hu-card-alt" aria-label="SSH 公共工具" data-testid="ssh-shared-tools">
      <h2>MCP 与共享工具权限</h2>
      <p>工具选择和服务配置由能力网关管理。CLI 使用同一份工具策略。</p>
      {toolAccess.state === "ready" ? (
        <p>
          公共工具策略版本 <strong data-testid="ssh-tool-policy-revision">{toolAccess.revision}</strong>
        </p>
      ) : (
        <p role="alert">公共工具策略不可读，外部工具已暂停。</p>
      )}
      <p>{!active ? "SSH 插件当前不可用。" : !ssh.some(({ exposable }) => exposable) ? "当前没有可开放的 SSH 工具。" : "在能力网关的 MCP 工具目录更改可开放工具的选择。"}</p>
      <dl aria-label="MCP 服务状态">
        <dt>MCP stdio</dt>
        <dd>{mcp.enabled ? "已启用" : "已关闭"}</dd>
        <dt>MCP Streamable HTTP</dt>
        <dd>{mcp.enabled && mcp.transport === "http" ? "端点已启用，需要服务端令牌" : "端点已关闭"}</dd>
      </dl>
      <details>
        <summary>SSH 能力目录（{ssh.length}）</summary>
        <SearchBox value={filter} onChange={setFilter} placeholder="搜索 SSH 能力" />
        {matches.length ? (
          <ul>
            {matches.map((tool) => (
              <li key={tool.name}>
                {tool.title ?? tool.name} <code>{tool.name}</code> · {toolStatus(tool, toolAccess, mcp.enabled)}
              </li>
            ))}
          </ul>
        ) : (
          <p>没有匹配的 SSH 能力。</p>
        )}
      </details>
      <details>
        <summary>客户端配置示例</summary>
        <p>复制后填写库路径或服务端令牌。</p>
        <h3>stdio</h3>
        <pre>{stdio}</pre>
        <Button onClick={() => void copy(stdio)}>复制 stdio 示例</Button>
        <h3>Streamable HTTP</h3>
        <pre>{http}</pre>
        <Button onClick={() => void copy(http)}>复制 HTTP 示例</Button>
        {notice === "copied" && <p role="status">已复制配置示例。</p>}
        {notice === "failed" && <p role="alert">无法复制配置示例。</p>}
      </details>
      <details>
        <summary>SSH 网关最近活动</summary>
        {audit.isError ? (
          <p role="alert">无法读取网关审计。</p>
        ) : audit.isPending ? (
          <p role="status">正在读取网关审计…</p>
        ) : recent.length ? (
          <ul>
            {recent.map(({ at, capability, entry, code }, index) => (
              <li key={`${at}:${capability}:${index}`}>
                <time dateTime={at}>{new Date(at).toLocaleString()}</time> · {entry} · <code>{capability}</code> · {code}
              </li>
            ))}
          </ul>
        ) : (
          <p>当前没有 SSH 网关活动。</p>
        )}
      </details>
    </section>
  );
}
