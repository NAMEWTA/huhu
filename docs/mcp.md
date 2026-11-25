# 通过一个 Huhu 条目接入 MCP

在拥有目标 Vault 的机器上打开能力网关。「服务端」负责启用 MCP、显示当前生效的 URL 并签发客户端令牌。「工具」负责选择开放的 Huhu 能力。「MCP 来源」负责上游配置、检查与外部条目发布。新增上游或调整开放范围后，客户端用原 `huhu` 配置重新读取目录。

## 配置客户端

在「服务端」为每个客户端创建独立命名的令牌，复制配置示例，用该客户端自己的凭据存储填入令牌。下方端口为示例，请替换为实际生效的端口。

```json
{
  "mcpServers": {
    "huhu": {
      "url": "http://127.0.0.1:6770/mcp",
      "headers": { "Authorization": "Bearer <该客户端的 Huhu 令牌>" }
    }
  }
}
```

### Codex 交互会话

在计划用于交互式 Codex 的原生配置中加入一项。命令使用当前 Codex 配置目录。可先用 `codex mcp get huhu --json` 检查该名字是否已被使用。

```sh
codex mcp add huhu --url http://127.0.0.1:6770/mcp --bearer-token-env-var HUHU_MCP_TOKEN
codex mcp get huhu --json
```

在 Huhu 的「智能体设置」下新建 Codex「启动环境」，把 `HUHU_MCP_TOKEN` 存为受保护变量。在目标 Space 的启动菜单选择「使用启动环境…」，选择该环境并确认启动。在外部终端使用 Codex 时，由操作系统凭据存储或当前会话的启动脚本设置同名环境变量。配置文件只保留令牌的变量名。

在 Codex 的 `/mcp` 查看 `huhu` 下实际发现的工具。验证时可以开放 `vault.info` 和一个测试用外部 echo 工具，然后分别调用，核对 Vault ID 和上游收到的参数。停止接入时，先到能力网关撤销对应令牌，再执行 `codex mcp remove huhu`。移除操作只针对该名称。

受控 Task 使用独立的 provider 配置和执行身份。目前其目标能力明确返回 `no_task_tool_scope`。交互配置不会授予 Task 调用 MCP 的权限。

### CI 或另一台机器

保持 Engine 监听回环地址。在 Engine 宿主用已安装的 Huhu CLI 管理同一 Vault 的常驻进程。将端口设为固定值时，以「服务端」显示的生效端口为准。若显示待重启，先重启 Engine，核对端口后再分发客户端配置。

```sh
huhu engine start --vault "$HUHU_VAULT_PATH" --mode resident
huhu engine status --vault "$HUHU_VAULT_PATH" --json
```

使用已授权的 SSH 隧道或受信任的认证转发。以下示例从 CI 机器建立回环隧道。在 CI 的秘密存储中配置专用 `HUHU_MCP_TOKEN`。

```sh
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:16770:127.0.0.1:6770 "$HUHU_ENGINE_HOST"
```

隧道保持运行时，把 CI 的 Streamable HTTP 客户端 URL 配为 `http://127.0.0.1:16770/mcp`，携带该客户端的 Bearer 凭据。来源的 stdio 命令在 Engine 宿主执行。重启同一 Vault 的常驻 Engine 后，用原 URL、新 MCP 会话重列目录并各调用一项工具。随后撤销 CI 令牌，核对旧会话和新会话均被拒而另一令牌继续可用。

标准 SDK 使用实际的 Streamable HTTP transport。以下片段用已安装的 `@modelcontextprotocol/sdk`，并由环境提供 URL、令牌与已开放的测试 echo 工具公开名。

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const { HUHU_MCP_URL, HUHU_MCP_TOKEN, HUHU_ECHO_TOOL } = process.env;
if (!HUHU_MCP_URL || !HUHU_MCP_TOKEN || !HUHU_ECHO_TOOL) {
  throw new Error("需要提供 MCP 地址、令牌和测试工具公开名");
}
const client = new Client({ name: "huhu-ci", version: "1" });
const transport = new StreamableHTTPClientTransport(new URL(HUHU_MCP_URL), {
  requestInit: { headers: { Authorization: `Bearer ${HUHU_MCP_TOKEN}` } },
});
try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map(({ name }) => name);
  if (!names.includes("vault_info") || !names.includes(HUHU_ECHO_TOOL)) throw new Error("目录缺少测试工具");
  const builtin = await client.callTool({ name: "vault_info", arguments: {} });
  const external = await client.callTool({ name: HUHU_ECHO_TOOL, arguments: { value: "huhu-ci-proof" } });
  if (builtin.isError || external.isError || external.structuredContent?.value !== "huhu-ci-proof") {
    throw new Error("工具调用未通过");
  }
} finally {
  await client.close();
}
```

本机回环测试覆盖两种来源、Engine 重启、令牌撤销和上游计数。异机 CI 仍需用实际部署的通道独立取证。 [SDK 接入测试](../apps/cli/test/mcp-aggregate.test.ts)
