# Mail Graph 第二轮收口
Lead t3p / worker t10x。工作树 agent-linux，基线4ae7e7e4。先读AGENTS、dev-build、../t10q/report01.md、../t10w/report01.md及原实现。唯一可写 plugins/mail/**，但 UPSTREAM.md 归 Lead。不要改其他worker文件，不暂存提交，不启动子代理。
修 t10w 的4个P2与1个P3，保持现有Exchange默认/Graph静默已有授权路径。有限缓存不等于丢失最终窗口：通过已有有界对账/Inbox查询核对最终200条，避免无界内存或默默推进遗漏游标。同ID矛盾删除/局部更新按当前Inbox归属对账，允许移回；请求abort在最后等待者离开时同步cancel作业，其他等待者继续；刷新完整grant明确拒绝时在同资源仅读取scope重试，不在未知网络结果无限重试；收件403区别本地缺scope和服务拒绝。写对应回归用例，尤其201邮件后删最新、removed后旧局部更新/真实移回、写点前最后waiter同步abort以及保留其他waiter、完整scope拒绝而read成功、403已有read的文案。
不要扩大产品范围或新增Graph同意流程。界面文字变更遵守已有modern-web指导；如需新客户端实现先执行guidance search/retrieve。
本轮所有验证禁止运行（包括单测/tsc/E2E/构建/GUI），全量E2E t109仍在冻结integration执行，Lead之后串行验证。不得修改integration。报告temp/final-audit/t10x-report01.md，列实现证据与未运行验证。完成终端正文回复即可，不用hc send，不提权。
