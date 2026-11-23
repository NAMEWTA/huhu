# task02 Windows runner 修复
Lead t3p，worker t1gn。同目录报告，实际写 temp/cross-platform-release/t1gn-report02.md，不hc send。
首轮GitHub run45134418196 Windows job137557157090 实际失败在 fetch-herdr：Git Bash 令 Node child_process 的 tar 命中 GNU tar，D:\a\huhu\huhu\.cache 路径被当远程host，tar Cannot connect to D。原 release.yml Windows默认pwsh成功。只修改新增workflow，Windows Core下载改原生pwsh shell和$env:TARGET，macOS仍bash；核对同类打包步骤是否依赖Windows原生tar，必要时采用native Windows命令步骤。不要改tag业务代码。保持所有当前断言。给出最小修订报告；独审t1gp只读正在核对同文件。
