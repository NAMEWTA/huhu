# Mail 重授权作业与重试反馈
Lead t3p，worker t144，agent-linux，sol/high。前 task02 原三P2已关闭，t14n OAuth7绿、t14q types绿、t14t lint绿、t14w outbox20绿。读取 temp/final-audit/t14s-report01.md 两项新P3。
先只补最低必要回归，不改生产、不运行测试。范围 OAuth engine test、Graph夹具、Mail现有UI测试/E2E。1 Graph第一页挂起，同账号重授权切Exchange，然后新revision立即刷新；旧Graph取消不请求后页，新入口不复用旧作业并成功读Exchange。必须保留工作台本次自身刷新续期不会自取消正例。2 MIME构建后改只收信导致明确未投递，结果原因可解释、UI即时不提供不可用的重试；恢复发信后保留原收件人重试资格。复用已有能力/账号/发件结果fixture，不构建新设施。
写 temp/final-audit/t144-red03-ready.md，标明最小 -t 筛选与当前预期失败。Lead跑红后再派生产。不得改Notes/EngineClient、SSH，不新派代理、不发送消息。
