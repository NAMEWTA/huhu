# #6 诊断报告：编辑器拦截了工作台的会话复查

**根因已在真实 Edge 确认。** 撤销邀请后，笔记和任务两个页面均执行了 `BrowserRoot.checkSession("reconnecting")`。编辑器安装在 `window.fetch` 上的适配器接管了相对路径 `/api/v1/bootstrap`，在页面内生成 404。请求因此没有到达引擎。浏览器把这个结果当作暂时不可用，保留了工作台。服务端已经拒绝旧会话的 WebSocket 握手。

**集成采用的修复。** Lead 已将 `web-host.ts` 的 bootstrap 和 session 请求改为使用精确的绝对同源 URL。编辑器适配器会把 URL 对象交给原 Fetch，真实 401 因而可以驱动已有过期状态。下文记录两种证据：绝对 URL 的离线回归，以及在同一旧构建上独立完成的真实 Edge 对照。

**旧候选保全。** 完整构建独立存放在 `temp/issue-baseline/t11j-5cb39eb37dbc/out`。复制时逐文件核对了相对路径及 SHA-256，共 493 个文件、38,927,119 字节。相邻的 `out.sha256` 是完整清单，其 SHA-256 为 `a9444df3c8df35204ac351eeeb0fa2e938d6ab81f79722e08aba8c5a58bd6fb9`。原集成构建目录已释放。报告中的冻结组行号、构建块及观察均可对照此副本。

在仓库根目录运行 `node --disable-warning=ExperimentalWarning temp/issue-baseline/t11j-5cb39eb37dbc/web-host-url.mjs` 可离线重放 Lead 的两处 URL 修改。夹具加载冻结提交的真实 host-fetch 和 web-host，在内存中仅替换这两处参数。旧版 bootstrap 到达底层 Fetch 零次并抛错；修改后依次观察到同源 session POST 204、bootstrap GET 401，返回 `null`，编辑器的 `/api/pages` 仍返回 200。此夹具不发起网络连接。

**独立 Edge 对照。** 为单独验证路径拦截的因果关系，我在测试浏览器收到的 `host-fetch` 脚本中、通用 `/api/` 分支前插入了以下一行，对应源码 `packages/editor/src/host/host-fetch.ts:68`。它将原始输入及 `RequestInit` 交给底层 Fetch。此变体通过了原探针的全部业务断言。

```ts
if (raw.startsWith("/api/v1/")) return original(input, init);
```

## 从撤销到界面的证据

版本取自集成目录 `apps/desktop/out/build-info.json`，提交为 `5cb39eb37dbcf8df563e5eed1fbb72bdbf24bbc3`。以下源码行号均对应此提交。实测使用 Edge 157.0.4341.60，桌面端为 Electron 44.9.1 / Chromium 152.0.7977.167。历史记录位于 `temp/issue-baseline/core-finished/{t119,t11b,t11c,t11g}.log`。

1. **首次加载能成功。** `apps/desktop/src/renderer/web-host.ts:6` 先读取 bootstrap，成功后才挂载工作台。笔记编辑面使用 `NoteEditorSurface.tsx:161` 的 `OkRoot`，任务详情也通过 `TaskDetail.tsx:146` 的 Markdown 组件挂载 `packages/editor/src/rich/compact.tsx:67` 的 `OkRoot`。`packages/editor/src/rich/OkRoot.tsx:66` 安装全局 Fetch 适配器。这解释了笔记页和任务页为何同时受影响。`EngineClient.call` 使用绝对 URL（`packages/workbench/src/engine-client/client.ts:49`），仍能成功创建任务、保存笔记。
2. **回调完整到达。** 源码 `apps/desktop/src/renderer/main.tsx:390,289` 传递 `checkSession`，`packages/workbench/src/engine-client/react.tsx:62` 将它设为 `onState`，`client.ts:122` 在非主动关闭时发出 `reconnecting`。实际加载的 `src-Bwytnh6M.js:28866–28879` 与此一致。对冻结产物设置只记录值的断点后，两个被撤销页面各观察到四次 `closed=false → onState 为函数 → checkSession("reconnecting") → browserEndpoint 收到 404`。第三个页面断开次数为零。
3. **404 来自页面内。** 构建 `host-fetch-B6-DA4eO.js` 的 `installHostFetch` 会将所有以 `/api/` 开头的相对路径交给编辑器。未注册的路由返回 `404 NOT_AVAILABLE`（源码 `host-fetch.ts:58,68`）。两个页面在撤销后新增的 bootstrap 网络请求均为零。页面重载前和重载时各有一次正常的 200。原探针装在适配器下层的 Fetch 记录器因此看不到本地 404。
4. **旧界面得以保留。** `web-host.ts:7–8` 将 401 转成 `null`，其他非成功状态抛错。`main.tsx:378–387` 为暂时断网保留编辑状态，捕获了这个错误。只要真实 401 能到达，现有逻辑就会卸载工作台并显示“浏览器会话不可用”。本次证据支持保留既有重连和断网处理。

## 单项改动的 Edge 对照

从 `temp/issue-worktrees/integration` 启动，沿用 `temp/issue-baseline/web-workbench-edge.cjs` 的隔离 Vault、Electron userData 及三个独立 Edge 上下文。基线使用冻结脚本；修复组通过 Playwright 在测试页的脚本响应中插入上述一行。两组都保留原业务操作及断言。表中网络响应包含启动和页面重载。

| 测试页面 | 冻结构建的 bootstrap 网络响应 | 加入放行后的网络响应 | 放行后撤销结果 |
| --- | --- | --- | --- |
| 被撤销的笔记页 | 200、200 | 200、200、401 | 显示会话不可用 |
| 同一邀请的任务页 | 200、200 | 200、200、401 | 显示会话不可用 |
| 另一邀请的任务页 | 401、200 | 401、200 | 继续显示原任务，事件流保持连接。首个 401 来自加入前的访问 |

冻结组在原来的 5 秒断言内未显示过期提示。放行组完成了深链、任务创建、笔记保存、独立撤销、旧邀请再次打开以及关闭分享后桌面仍可用的断言，进程退出码为 0。本次真实 Edge 验证覆盖上述临时脚本变体。Lead 的绝对 URL 方案在本项中完成了离线回归，其正式构建的端到端结果由集成任务记录。

## 离线重放拦截边界

在仓库根目录用 PowerShell 和 Node 24 运行下段。它读取冻结提交里的真实适配器，在内存里分别执行原版和一行修复。底层 Fetch 固定返回 401，断言同时覆盖信号透传、已有编辑器路由及未知编辑器路由。

```powershell
@'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";

const rev = "5cb39eb37dbcf8df563e5eed1fbb72bdbf24bbc3";
const source = execFileSync("git", ["show", rev + ":packages/editor/src/host/host-fetch.ts"], { encoding: "utf8" });
const anchor = 'if (raw.startsWith("/api/") || raw === "/api")';
assert.equal(source.split(anchor).length, 2);
for (const fixed of [false, true]) {
  const candidate = fixed ? source.replace(anchor, 'if (raw.startsWith("/api/v1/")) return original(input, init);\n    ' + anchor) : source;
  const js = stripTypeScriptTypes(candidate);
  const { installHostFetch } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  const signal = new AbortController().signal;
  let forwarded = 0;
  globalThis.window = { fetch(input, init) {
    assert.equal(input, "/api/v1/bootstrap");
    assert.equal(init.signal, signal);
    forwarded++;
    return Promise.resolve(new Response(null, { status: 401 }));
  } };
  const restore = installHostFetch();
  try {
    const response = await window.fetch("/api/v1/bootstrap", { signal });
    const code = response.status === 404 ? (await response.json()).code : null;
    assert.deepEqual([response.status, forwarded, code], fixed ? [401, 1, null] : [404, 0, "NOT_AVAILABLE"]);
    assert.deepEqual(await (await window.fetch("/api/pages")).json(), { pages: [] });
    assert.equal((await window.fetch("/api/unknown-fixture")).status, 404);
    console.log(JSON.stringify({ fixed, status: response.status, forwarded, code }));
  } finally { restore(); }
}
'@ | node --disable-warning=ExperimentalWarning --input-type=module -
```

实际输出：

```jsonl
{"fixed":false,"status":404,"forwarded":0,"code":"NOT_AVAILABLE"}
{"fixed":true,"status":401,"forwarded":1,"code":null}
```
