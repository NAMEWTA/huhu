# W11 保险箱

## W11.1 密钥层级与锁定

- 目标：设置主密码、解锁、锁定、修改主密码，密钥只在 Engine 内存。
- 依据：[safe](../modules/safe.md) §4；[security](../security.md) §4；ACC-SF-02、03、05。
- 前置：W04.2、W03.3。
- 位置：`plugins/safe/{huhu-plugin.json,src/engine/{crypto,keyring,session}.ts}`。
- 复用：R-44。
- 实现要点：scrypt 参数与 `maxmem`；`seal/open` 格式（magic `HUHU\x01`、IV、tag、AAD）；`keyCheck`；锁定触发（手动、空闲计时、离开页面、Vault 关闭、插件停用、系统休眠/锁屏经 Main `powerMonitor` 通知）；错误 5 次冷却 30 秒；DK 清零。
- 异常：keyring 损坏 → 保险箱不可用并在健康中心报告，不覆盖文件。
- 测试：加解密单元测试（篡改密文、换 itemId 的 AAD 失败）；ACC-SF-02、03、05 集成测试（可控时钟）。
- 完成：三个 ACC 通过。

## W11.2 条目管理界面与审计

- 目标：保险箱模块：设置、锁定页、凭据列表与详情、新增/编辑/删除、显示与复制、复制引用、访问记录、锁定设置。
- 依据：safe §3；ACC-SF-01、07。
- 前置：W11.1、W02.2。
- 位置：`plugins/safe/src/engine/{items,audit,capabilities}.ts`、`plugins/safe/src/ui/`。
- 复用：R-45。
- 实现要点：元数据与密文分离存储；`safe.items.reveal` 仅桌面身份；复制调用 `huhuHost.copyText(..., {clearAfterMs: 30000})`；审计不记值；详情关闭时丢弃明文状态。
- 异常：锁定期间打开的编辑表单提交 → `SAFE_LOCKED`，表单保留输入并提示解锁。
- 测试：ACC-SF-01（全 Vault 与日志、数据包中搜索标记）；ACC-SF-07（Main 剪贴板逻辑单元测试）。
- 完成：两个 ACC 通过。

## W11.3 SecretUse 服务

- 目标：其他插件按引用安全使用秘密。
- 依据：safe §1、§4；ACC-SF-04、06。
- 前置：W11.1。
- 位置：`plugins/safe/src/engine/secret-use.ts`、`plugins/safe/src/shared/secret-ref.ts`。
- 复用：R-45（`credential-refs.js` 的引用解析逻辑转 TS）。
- 实现要点：`ctx.provide('secretUse', …)`；`resolve(ref, {plugin, purpose})` 校验条目存在、允许模块、已解锁，记录“使用”审计；引用格式只接受 `safe://<itemId>`。
- 异常：`SAFE_LOCKED`、`SECRET_REF_INVALID`。
- 测试：ACC-SF-04、06 契约测试。
- 完成：两个 ACC 通过。
