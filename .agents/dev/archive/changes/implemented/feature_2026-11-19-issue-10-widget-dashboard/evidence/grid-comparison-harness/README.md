# W01-01 冻结对照夹具

这个目录保存 t1fc 完整运行使用的夹具和独立 npm 锁文件。它引用 Huhu 的生产画布，因此复跑时使用替换画布前的 Huhu 提交 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2`。Homarr 只需检出固定的布局源码。

在本目录运行以下准备命令。独立副本便于保留原夹具相对路径与生产基线。

```bash
project=$(git rev-parse --show-toplevel)
harness=$(pwd)
replay=$(mktemp -d)
git clone --shared --no-checkout "$project" "$replay"
git -C "$replay" checkout --detach cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2
mkdir -p "$replay/temp/closeout-release/grid-comparison" "$replay/temp/sources"
cp -R "$harness/." "$replay/temp/closeout-release/grid-comparison/"
git clone --no-checkout --filter=blob:none https://github.com/homarr-labs/homarr.git "$replay/temp/sources/homarr"
git -C "$replay/temp/sources/homarr" checkout --detach b440fdd574c9daa229f5cf64f7b2532770799664
cd "$replay"
pnpm install --frozen-lockfile
cd temp/closeout-release/grid-comparison
npm ci --ignore-scripts --no-audit --no-fund
```

在该夹具目录启动 `npm run start`，等待 Vite 依赖预优化完成。在相同目录的另一个终端使用 Playwright 自带的 Chromium 串行执行。

```bash
HUHU_GRID_OUTPUT_DIR="$PWD/../grid-comparison-results/artifacts-stable" node ../../../node_modules/@playwright/test/cli.js test -c playwright.config.mjs
```

需要首次安装 Playwright Chromium 时，在夹具目录执行 `node ../../../node_modules/@playwright/test/cli.js install chromium`。原运行使用 Playwright 1.65.0 与 Headless Chromium 158.0.8127.18。浏览器触摸由 CDP 驱动，125% 测试为 CSS 缩放。保存使用浏览器 localStorage 的隔离草稿。真实 Vault、安装包和物理设备的证据另行记录。

[对照结果](../W01-01-grid-comparison.md) · [原件 SHA-256](../W01-01-grid-artifacts.sha256)
