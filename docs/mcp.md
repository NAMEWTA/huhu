# 通过一个 Huhu 条目接入 MCP

在拥有目标 Vault 的机器上打开能力网关。在「MCP」启用服务、查看当前生效的 URL、复制配置，并从 Tools 页选择开放的 Huhu 能力。到「服务端」签发客户端令牌。从「MCP」下的「外部 MCP 服务」配置和检查上游、发布外部条目。新增上游或调整开放范围后，客户端用原 `huhu` 配置重新读取目录。

## 配置客户端

在「服务端」为每个客户端创建独立命名的令牌，再从「MCP」复制客户端配置。在客户端自己的凭据存储中填入令牌。下方端口为示例，请替换为实际生效的端口。

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

在 Huhu 的「智能体设置」下新建 Codex「启动环境」，把 `HUHU_MCP_TOKEN` 存为受保护变量。使用自定义 Codex 配置目录时，在同一启动环境中以普通变量设置对应的 `CODEX_HOME`。在目标 Space 的启动菜单选择「使用启动环境…」，选择该环境并确认启动。在外部终端使用 Codex 时，由操作系统凭据存储或当前会话的启动脚本设置同名环境变量。配置文件只保留令牌的变量名。

在 Codex 的 `/mcp` 查看 `huhu` 下实际发现的工具。验证时可以开放 `vault.info` 和一个测试用外部 echo 工具，然后分别调用，核对 Vault ID 和上游收到的参数。停止接入时，先到能力网关撤销对应令牌，再执行 `codex mcp remove huhu`。移除操作只针对该名称。

受控 Task 使用独立的 provider 配置和执行身份。目前其目标能力明确返回 `no_task_tool_scope`。交互配置不会授予 Task 调用 MCP 的权限。

### CI 或另一台机器

保持 Engine 监听回环地址。在 Engine 宿主用已安装的 Huhu CLI 管理同一 Vault 的常驻进程。将端口设为固定值时，以「MCP」显示的生效端口为准。若显示待重启，先重启 Engine，核对端口后再分发客户端配置。

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

## 管理外部来源

1. 在「外部 MCP 服务」添加单个服务，或导入 `mcpServers` JSON。导入先预览，确认后新增来源仍为停用状态。保存 URL、命令、参数与非秘密引用，使用认证管理绑定秘密。
2. 对 stdio 来源先核对命令、参数和本机执行许可。远端来源可配置无认证、环境变量或受保护 header。Streamable HTTP 还可配置 OAuth。用「检查连接」读取来源诊断。
3. 在 Tools、Resources、Templates、Prompts 目录按来源筛选，预览并确认要发布的条目。启用来源和「MCP」总开关后重列客户端目录。撤销条目后，旧工具名称或资源 URI 也会被拒绝。

来源管理能力包括 `mcp.sources.*`、`mcp.executionApproval.*`、`mcp.credentials.*`、`mcp.oauth.*`、`mcp.catalog.list`、`mcp.policy.*` 和 `mcp.diagnostics.get`。Gateway 显示来源目录和内置能力。普通 `huhu call` 与 `/api/v1/capabilities` 继续使用内置静态能力面，聚合来源的动态条目从 `/mcp` 调用。 [描述符](../packages/kernel/src/mcp-sources/index.ts) · [Gateway 来源面板](../packages/workbench/src/gateway/McpSourcesPanel.tsx)

## 协议兼容范围

Huhu 使用锁定的 TypeScript SDK 1.32.2。下表的主验收握手为 `2025-11-25`。

| 通道 | 已有支持及证据 |
| --- | --- |
| 客户端 → Huhu | 唯一 Streamable HTTP `/mcp`，使用当前 Vault 的入站令牌。旧 `/api/v1/mcp` 返回 404，旧 CLI 服务子命令已移除。 [端点测试](../apps/engine/test/endpoint-contract.test.ts) · [CLI 回归](../apps/cli/test/cli.test.ts) |
| Huhu → stdio | Engine 宿主上明确批准后启动和发现；连接和派生进程随作用域回收。 [来源测试](../packages/kernel/test/mcp-sources.test.ts) |
| Huhu → Streamable HTTP | 支持无认证、静态认证、环境引用和 OAuth。 [传输及认证实现](../packages/kernel/src/mcp-sources/transport.ts) · [OAuth 夹具](../packages/kernel/test/fixtures/mcp-oauth.ts) |
| Huhu → HTTP+SSE | 遗留上游传输，支持静态认证或环境引用。 [三类上游联测](../packages/kernel/test/mcp-sources.test.ts) |
| 工具、资源、模板、提示 | `tools/list`、`tools/call`、`resources/list`、`resources/templates/list`、`resources/read`、`prompts/list`、`prompts/get`。 [协议实现](../packages/kernel/src/mcp.ts) · [Gateway 联测](../tests/e2e/workflows/mcp-aggregation.spec.ts) |
| 超出本期范围 | 只支持 2026 代际的对端、资源订阅、roots、sampling、elicitation、Tasks、MCP Apps、Code Mode 与工具搜索。上游握手版本不兼容，或其 SDK 明确要求客户端 sampling、elicitation 或 roots 时，来源面板显示不兼容原因。 [协议常量](../packages/contracts/src/mcp-routing.ts) · [检查回归](../packages/kernel/test/mcp-sources.test.ts) |

## 故障排查

| 现象 | 检查 |
| --- | --- |
| 初始化返回 401 | 核对指定客户端的独立入站令牌是否已签发或撤销。遇到 403，检查调用方是否误用了 Desktop 或普通 CLI 的凭据。 |
| URL 变为 404 或连接失败 | 核对 Engine 是否在运行、MCP 总开关和模块是否启用、当前端口是否生效。异机客户端还需确认隧道的本地端口和远端目标。 |
| 上游拒绝认证或缺少执行许可 | 在服务详情核对上游认证绑定。stdio 源的配置变化后重新检查本机执行许可。 |
| 目录为空或缓存标识被拒 | 确认来源已启用、当前目录发现成功且相应条目已选择开放。工具结果中的资源链接仍服从资源或模板的独立授权。 |
| 不支持的协议版本或反向能力 | 在服务详情查看「检查连接」的诊断，选择支持当前协议且可独立提供目录的上游版本。 |
| 发送后断线、结果未知 | 使用原来源的任务或结果记录核实副作用。重新连接只恢复目录和连接，需避免重复执行已经送达的外部操作。 |

生产源码、上游映射、测试来源与许可证见 [MCP 来源台账](upstream/ledger.md#mcp-聚合来源与合同12-p0) 与 [第三方声明](../THIRD_PARTY_NOTICES.md)。
