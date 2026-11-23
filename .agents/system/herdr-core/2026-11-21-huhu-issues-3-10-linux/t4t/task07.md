# #4 / #5 同一安装包候选的独立签收核对
共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行 t4t，只读固定候选 f310e541a86825cc5a7ac100b4c230e5bbf1fdca，写 t4t/report07.md。依据 dev-review、dev-verify 和 W8.2／W8.3／T7.1／T7.2 文档。已暂缓 #7。
核对集成候选的实际 Tasks 调用者、CLI 与 MCP 联验路径、两个独立的安装包用例及 package artifact 和执行文件是否固定在同一产物。重点找跳过、错误平台、测试环境误用个人上下文、证据命令说通过但实际只枚举或环境变量令用例跳过等问题。给出能在 Linux x64 现有预检环境运行的精确候选门禁和已授权夹具，以及需要修复的具体断点。只读代码、不启动构建、E2E 或测试套件、不写远端。不要用旧 Windows 或源码用例结论作为包验收。
