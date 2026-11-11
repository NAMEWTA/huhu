@echo off
rem HUHU 命令行：用应用自带的 Electron 以 Node 模式运行打包好的 cli.mjs
set "RES=%~dp0.."
set ELECTRON_RUN_AS_NODE=1
if not defined HUHU_ENGINE_ENTRY set "HUHU_ENGINE_ENTRY=%RES%\app.asar\out\main\engine.js"
if not defined HUHU_HERDR_BIN if exist "%RES%\herdr\win32-x64\herdr-core.exe" set "HUHU_HERDR_BIN=%RES%\herdr\win32-x64\herdr-core.exe"
"%RES%\..\HUHU.exe" "%RES%\cli\cli.mjs" %*
exit /b %ERRORLEVEL%
