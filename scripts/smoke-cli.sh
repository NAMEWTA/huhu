#!/bin/sh
# 命令行冒烟（Linux/macOS）：对解包后的应用目录（linux-unpacked 或 AppImage 解出的 squashfs-root）检查
#   1. resources/bin/huhu --version 输出与应用版本一致
#   2. 没有运行中的 Engine 时，huhu call vault.info 能自动启动 Engine（走 app.asar 里的 engine.js）并返回 ok
set -u
APPDIR="$1"
EXPECT="${2:-}"
HUHU="$APPDIR/resources/bin/huhu"
[ -x "$HUHU" ] || { echo "找不到可执行的 $HUHU" >&2; exit 1; }
VER=$("$HUHU" --version) || { echo "huhu --version 失败" >&2; exit 1; }
[ -z "$EXPECT" ] || [ "$VER" = "$EXPECT" ] || { echo "版本不一致：huhu 输出 $VER，期望 $EXPECT" >&2; exit 1; }
V=$(mktemp -d)
cleanup() { rm -rf "$V"; }
trap cleanup EXIT
# 先让应用建好 Vault，再结束它，确保接下来是 CLI 自己拉起 Engine
APP="$APPDIR/huhu"
[ -x "$APP" ] || APP="$APPDIR/HUHU"
HUHU_VAULT="$V" timeout 25 xvfb-run -a "$APP" --no-sandbox >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 20); do sleep 1; [ -f "$V/.huhu/vault.json" ] && break; done
[ -f "$V/.huhu/vault.json" ] || { echo "应用没有在 25 秒内创建 Vault（若 TMPDIR 路径过长，Chromium 的单实例套接字会失败，请改用较短的 TMPDIR）" >&2; pkill -f "$V" 2>/dev/null; exit 1; }
kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
pkill -f "$V" 2>/dev/null; sleep 1
OUT=$("$HUHU" call vault.info --vault "$V" --json) || { echo "huhu call vault.info 失败：$OUT" >&2; exit 1; }
case "$OUT" in *'"ok": true'*|*'"ok":true'*) echo "命令行冒烟通过：$VER" ;; *) echo "huhu call 返回异常：$OUT" >&2; exit 1 ;; esac
pkill -f "$V" 2>/dev/null
exit 0
