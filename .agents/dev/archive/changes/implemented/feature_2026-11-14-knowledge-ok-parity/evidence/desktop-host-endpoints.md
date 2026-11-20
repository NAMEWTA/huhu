# 桌面产物的 OK 宿主调用审计（H04）

[产物清单](desktop-host-endpoints.json)由以下命令从 Electron 生产 JavaScript 分片逆向枚举字面 `/api/` 路径和直接 `window.okDesktop` 属性链，记录分片名与字符偏移，并对照宿主路由注册处。调用中的静态字面值与其他字符串分别记录。离线 Emoji 的前缀会展开到实际的四个处理器。

```sh
pnpm build
node packages/editor/build/check-host-endpoints.mjs --assert
```

`--assert` 在有未归类签名时返回失败。路径匹配到一个或多个已经注册的方法。方法选择、动态参数、通过局部别名访问的 bridge 成员及分支可达性仍需结合源码和用户入口核对。

| 调用 | 处理 |
| --- | --- |
| `/api/document`、`/api/backlink-counts` | 复用当前 Vault 的读取与反链服务。已加形状、错误文案及异步跨 Vault 缓存隔离的自动断言。 |
| `/api/asset` | OK 的页图标／封面辅助函数构造浏览器图片地址。需核对成品属性编辑 UI 所有资源入口是否都经过 Huhu 媒体路径。 |
| `/api/link-preview` | `HostConfigProvider` 默认关闭联网（Q3）。可启用的设置与限时限大小的主进程获取仍缺。 |
| `okDesktop.shell.openExternal` | bridge 能转交 `OkHost`，实际桌面渲染目前未安装外链 provider。与 OP-D08 的用户动作和桌面外链策略一起定案。 |
