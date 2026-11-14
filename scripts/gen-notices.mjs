// 生成 THIRD_PARTY_NOTICES.md：运行时依赖闭包的许可证清单 + 复制来源台账 + 随包二进制。
// 遇到不在允许列表里的许可证时退出非 0（发布前必须人工确认）。
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = [
  /^MIT/,
  /^ISC$/,
  /^BSD/,
  /^Apache-2\.0/,
  /^0BSD$/,
  /^BlueOak/,
  /^CC0/,
  /^Python-2\.0$/,
  /^MPL-2\.0$/,
  /^Unlicense$/,
  /^CC-BY-4\.0$/,
  /^OFL-1\.1$/,
  /WTFPL/,
  /^\(?MIT OR/,
  /^\(?BSD/,
  /^\(?Apache/,
  /^\(MPL-2\.0 OR Apache-2\.0\)$/,
];

// package.json 里没有 license 字段、但随包带有许可证文本的依赖：人工核对 LICENSE 文件后在这里登记（不是放宽允许列表）。
const MANUAL = { "khroma@2.1.0": "MIT" }; // mermaid 的依赖；包内 license 文件为 MIT（Copyright Fabio Spampinato, Andrew Maney）

// 工作区包（renderer/engine/CLI）都被打包进应用，其依赖大多声明为 devDependencies，所以直接读取 pnpm 虚拟仓库里
// 安装的每个包（偏保守的超集：也包含构建工具；构建工具不随包分发，但列出不会有害）。
const store = path.join(root, "node_modules", ".pnpm");
const seen = new Map();
for (const entry of readdirSync(store)) {
  if (entry.startsWith("@huhu+") || entry === "node_modules" || entry.startsWith(".")) continue;
  const m = /^(@[^+]+\+[^@]+|[^@]+)@(\d[^_]*)/.exec(entry);
  if (!m) continue;
  const name = m[1].replace("+", "/");
  const dir = path.join(store, entry, "node_modules", name);
  if (!existsSync(path.join(dir, "package.json"))) continue;
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  const license = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? pkg.licenses?.map((l) => l.type).join(" OR ") ?? "UNKNOWN");
  seen.set(`${name}@${m[2]}`, { name, version: m[2], license: MANUAL[`${name}@${m[2]}`] ?? license, homepage: typeof pkg.homepage === "string" ? pkg.homepage : "" });
}
const rows = [...seen.values()];
rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const bad = rows.filter((r) => !ALLOWED.some((re) => re.test(r.license)));

// 随包字体（Fontsource 包，SIL OFL 1.1）：版权行与许可全文从各包的 LICENSE 读取，不手抄。
const FONTS = [
  ["inter", "Inter"],
  ["newsreader", "Newsreader"],
  ["geist", "Geist"],
  ["geist-mono", "Geist Mono"],
  ["jetbrains-mono", "JetBrains Mono"],
];
const fontLicense = (pkg) => {
  const dir = path.join(
    store,
    ...readdirSync(store)
      .filter((e) => e.startsWith(`@fontsource-variable+${pkg}@`))
      .slice(0, 1),
    "node_modules",
    "@fontsource-variable",
    pkg,
  );
  const text = readFileSync(path.join(dir, "LICENSE"), "utf8");
  const version = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version;
  return {
    copyright: text
      .split("\n")[0]
      .replace(/\s+\S+\[[^\]]*\]\.ttf:.*$/, "")
      .trim(),
    version,
    text,
  };
};
const fonts = FONTS.map(([pkg, family]) => ({ family, pkg, ...fontLicense(pkg) }));
const oflText = fonts[0].text.slice(fonts[0].text.indexOf("SIL OPEN FONT LICENSE")).trim();

const ledger = readFileSync(path.join(root, "docs/upstream/ledger.md"), "utf8");
const lines = [
  "# 第三方声明",
  "",
  "HUHU Workbench 以 GPL-3.0-or-later 发布（见 LICENSE）。以下是随应用分发的第三方组件及其许可证；本文件由 `scripts/gen-notices.mjs` 生成，请勿手工编辑。",
  "",
  "## 随包二进制与运行时",
  "",
  "- Electron / Chromium：见应用目录中的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html`。",
  "- Herdr Core（`herdr-core`）：Apache-2.0，官方发布包 https://releases.herdr.dev/core/（版本与 SHA-256 见 `scripts/herdr.lock.json`），源码 https://github.com/herdrdev/herdr-core；其内含 ghostty（MIT）；Windows 包另含 Microsoft ConPTY（MIT）。完整声明随包放在 `resources/herdr/<平台>/THIRD-PARTY-NOTICES`。",
  "",
  "## 随包字体",
  "",
  "应用随包带有以下字体（均为 SIL Open Font License 1.1，经 Fontsource 的 npm 包分发，只取 latin 与 latin-ext 子集；中文使用系统字体，不随包）。HUHU 横版 logo 的字标是 Geist 字形的轮廓化图形。",
  "",
  "| 字族 | 版权 | npm 包 |",
  "| --- | --- | --- |",
  ...fonts.map((f) => `| ${f.family} | ${f.copyright} | @fontsource-variable/${f.pkg}@${f.version} |`),
  "",
  "```text",
  oflText,
  "```",
  "",
  "## 复制或改造的源码（`docs/upstream/ledger.md`）",
  "",
  ledger.trim(),
  "",
  "## npm 运行时依赖",
  "",
  "| 包 | 版本 | 许可证 | 主页 |",
  "| --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.name} | ${r.version} | ${r.license} | ${r.homepage} |`),
  "",
];
writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.md"), lines.join("\n"));
console.log(`THIRD_PARTY_NOTICES.md：${rows.length} 个运行时依赖`);
if (bad.length) {
  console.error("以下依赖的许可证不在允许列表内，请人工确认：\n" + bad.map((r) => `  ${r.name}@${r.version}  ${r.license}`).join("\n"));
  process.exit(1);
}
