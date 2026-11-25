import type { CapabilityCatalogEntry, GatewayMcpStatus, ToolAccessSnapshot } from "@huhu/contracts";
import { Button, SearchBox } from "@huhu/ui";
import { host, useCapability } from "@huhu/workbench";
import { useState } from "react";

type Gateway = { mcp: GatewayMcpStatus; toolAccess: ToolAccessSnapshot };
type Activity = { at: string; entry: string; capability: string; code: string };

const reasons: Record<CapabilityCatalogEntry["availability"], string> = {
  active: "",
  "plugin-disabled": "插件已停用",
  "plugin-failed": "插件启动失败",
  "handler-missing": "能力处理函数尚未注册",
};

const capabilityCategories: Record<string, string> = {
  hosts: "主机与认证",
  keys: "主机与认证",
  auth: "主机与认证",
  authentication: "主机与认证",
  hostKey: "主机与认证",
  knownHosts: "主机与认证",
  resources: "主机与连接",
  connections: "主机与连接",
  connect: "主机与连接",
  disconnect: "主机与连接",
  workspace: "工作区",
  shells: "终端与作业",
  jobs: "终端与作业",
  exec: "终端与作业",
  local: "终端与作业",
  recordings: "终端与作业",
  shortcuts: "终端与作业",
  fileSessions: "文件与传输",
  sftp: "文件与传输",
  archives: "文件与传输",
  transfers: "文件与传输",
  routes: "路由与出站代理",
  outboundProxies: "路由与出站代理",
  configSync: "路由与出站代理",
  forwarding: "转发",
  proxyShare: "转发",
  monitor: "监控",
  settings: "设置与审计",
  audit: "设置与审计",
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
  const gateway = useCapability<Gateway>("gateway.get", {});
  const catalog = useCapability<CapabilityCatalogEntry[]>("capabilities.list", { includeInactive: true });
  const audit = useCapability<Activity[]>("gateway.audit.list", {});
  const [notice, setNotice] = useState<"copied" | "failed">();
  const [filter, setFilter] = useState("");

  if (gateway.isError || catalog.isError) return <p role="alert">无法读取公共工具策略或能力目录。</p>;
  if (!gateway.data || !catalog.data) return <p role="status">正在读取能力网关…</p>;
  const { mcp, toolAccess } = gateway.data;
  const ssh = catalog.data.filter(({ plugin }) => plugin === "ssh");
  const query = filter.trim().toLowerCase();
  const groups = new Map<string, CapabilityCatalogEntry[]>();
  for (const tool of ssh) {
    const category = capabilityCategories[tool.name.split(".")[1] ?? ""] ?? "其他能力";
    if (!`${tool.name} ${tool.title ?? ""} ${category}`.toLowerCase().includes(query)) continue;
    const tools = groups.get(category) ?? [];
    tools.push(tool);
    groups.set(category, tools);
  }
  const active = ssh.some(({ availability }) => availability === "active");
  const recent = (audit.data ?? []).filter(({ capability }) => capability.startsWith("ssh.") || capability.startsWith("ssh_")).slice(0, 10);
  const http = mcp.url ? JSON.stringify({ mcpServers: { huhu: { url: mcp.url, headers: { Authorization: "Bearer <在能力网关创建的令牌>" } } } }, null, 2) : null;

  async function copy(text: string) {
    try {
      if (bridge) await bridge.copyText(text);
      else await navigator.clipboard.writeText(text);
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
        <dt>MCP Streamable HTTP</dt>
        <dd>{mcp.enabled ? "端点已启用，需要服务端令牌" : "端点已关闭"}</dd>
      </dl>
      <details>
        <summary>SSH 能力目录（{ssh.length}）</summary>
        <SearchBox value={filter} onChange={setFilter} placeholder="搜索 SSH 能力" />
        {groups.size ? (
          [...groups].map(([category, tools]) => (
            <div key={category}>
              <h3>{category}</h3>
              <ul>
                {tools.map((tool) => (
                  <li key={tool.name}>
                    {tool.title ?? tool.name} <code>{tool.name}</code> · {toolStatus(tool, toolAccess, mcp.enabled)}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p>没有匹配的 SSH 能力。</p>
        )}
      </details>
      <details>
        <summary>客户端配置示例</summary>
        <p>复制后填写服务端令牌。</p>
        <h3>Streamable HTTP</h3>
        <pre>{http}</pre>
        <Button disabled={!mcp.enabled || http === null} onClick={() => { if (http) void copy(http); }}>复制 HTTP 示例</Button>
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
