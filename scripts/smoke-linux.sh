#!/bin/sh
# 打包冒烟（Linux）：启动 AppImage，确认 Engine 在 Vault 里写出端点描述（说明打包后的 utilityProcess 与原生模块正常），随后退出。
set -eu
APP="$1"
V=$(mktemp -d)
HUHU_VAULT="$V" timeout 25 xvfb-run -a "$APP" --appimage-extract-and-run --no-sandbox >/dev/null 2>&1 &
for _ in $(seq 1 20); do
  sleep 1
  if ls "$V"/.huhu/runtime/*/engine.json >/dev/null 2>&1; then echo "冒烟通过：Engine 已启动"; wait || true; rm -rf "$V"; exit 0; fi
done
echo "冒烟失败：25 秒内 Engine 没有启动" >&2
rm -rf "$V"
exit 1
