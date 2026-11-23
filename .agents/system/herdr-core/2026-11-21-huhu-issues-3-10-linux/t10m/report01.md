# t10m B01 画板快照只读诊断（Lead 从终端保存）

对象：4ae7e7e4，t109 第162项 local-reference-blocks.spec.ts:54。报告写入权限请求已取消，未提权；以下由 Lead 从 worker 最终输出整理。

首次 img.src 断言失败时镜像正文已读到，画板显示“无法渲染画板快照”；外改、关页、切 Vault 尚未执行。组件 JSON、模块加载、restoreScene 已完成，但 exportToSvg / 序列化 / createObjectURL 与 img.onError 共用 export 错误状态，现有 trace 无控制台、网络或 SVG 原始字节，不能确定首个失败阶段。

待验证的两条线索：生产 Excalidraw createElementNS 后又 setAttribute xmlns，Huhu XMLSerializer 可能重复声明，而上游用 svg.outerHTML；实际工作台 CSP 为 img-src self data:，快照为 blob URL，需收集强制 CSP 事件确认是否拦截。仅矩形首图不使用文本字体，不应归因于缺失字体资源。已通过的200轮泄漏测试未创建 Excalidraw 快照。

下一次 Lead 定向运行打开前监听 console/pageerror/requestfailed/securitypolicyviolation。如解码失败，原样转调 createObjectURL 并读取 Blob 文本，记录根标签、字节数、XML parsererror；与 disposition/effectiveDirective/blockedURI 对照。维持原断言和时限，验收 naturalWidth、外改 URL 轮换及释放、关页释放、切 Vault 后第二图解码。

静态另见卸载缺口：替换时释放旧 URL，卸载仅取消导出，lastUrlRef 未释放。释放断言先证明活 URL 可读取/解码，避免将 CSP fetch 拒绝当作释放成功。该缺口不是已证实的首图根因。

本轮没有运行应用、GUI、测试、类型检查、构建或打包，也没有修改业务和测试代码。首图根因与实际释放行为仍待定向验收。
