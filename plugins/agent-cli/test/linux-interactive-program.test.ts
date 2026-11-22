import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { assert, expect, test } from "vitest";
import { InteractiveEnvironment } from "../src/engine/interactive-environment.js";
import type { AgentEnvironmentAccess } from "../src/engine/launch-environment.js";
import { resolveAgentLaunch } from "../src/engine/launch.js";
import { emptyAgentSettings } from "../src/shared/settings.js";

const platform = process.platform === "linux" && process.arch === "x64";
const protectedName = "HUHU_PROVIDER_FIXTURE_SECRET";
const selection = { id: randomUUID(), revision: randomUUID() };
const shell = "/bin/sh";

function buildFile(file: string, data: string, mode = 0o600) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data, { mode });
  return file;
}

function environments(helper: string, ordinary: Record<string, string>) {
  const credentials: AgentEnvironmentAccess = {
    available: true,
    profile: async (_selection, provider) => ({
      ...selection,
      provider,
      name: "Linux provider fixture",
      ordinary: Object.entries(ordinary).map(([name, value]) => ({ name, value })),
      protectedNames: [protectedName],
      states: { [protectedName]: "configured" },
    }),
    use: async (_selection, _provider, _purposes, consumer) => consumer(new Map([[protectedName, "synthetic"] as const])),
  };
  return new InteractiveEnvironment(helper, credentials);
}

function installFixture(work: string) {
  const home = path.join(work, "Volta 工具");
  const bin = path.join(home, "bin");
  const images = path.join(home, "tools/image");
  const piPackage = "@earendil-works/pi-coding-agent";
  const codexPackage = "@openai/codex";
  const install = (name: string) => path.join(images, "packages", name, "lib/node_modules", name);
  const cwd = path.join(work, "工作 区");
  mkdirSync(cwd);
  buildFile(path.join(cwd, "approved-cwd"), "fixture");
  const piRoot = install(piPackage);
  const codexRoot = install(codexPackage);
  const platformRoot = path.join(codexRoot, "node_modules/@openai/codex-linux-x64");
  const codexVendor = path.join(platformRoot, "vendor/x86_64-unknown-linux-musl");
  const piEntry = buildFile(path.join(piRoot, "dist/bundle/cli.js"), "#!/usr/bin/env node\nconst fixture = true;\n", 0o700);
  const chunk = buildFile(path.join(piRoot, "dist/bundle/chunks/runtime.js"), "export const fixture = true;");
  const theme = buildFile(path.join(piRoot, "dist/modes/interactive/theme/dark.json"), '{"name":"fixture"}');
  mkdirSync(path.join(piRoot, "node_modules"));
  buildFile(path.join(piRoot, "package.json"), JSON.stringify({ name: piPackage, version: "1.5.2", bin: { pi: "dist/bundle/cli.js" } }));
  const codexEntry = buildFile(path.join(codexRoot, "bin/codex.js"), "#!/usr/bin/env node\n", 0o700);
  buildFile(path.join(codexRoot, "package.json"), JSON.stringify({ name: codexPackage, version: "0.171.0", bin: { codex: "bin/codex.js" } }));
  buildFile(path.join(platformRoot, "package.json"), JSON.stringify({ name: codexPackage, version: "0.171.0-linux-x64" }));
  buildFile(path.join(codexVendor, "codex-package.json"), JSON.stringify({ layoutVersion: 1, version: "0.171.0", target: "x86_64-unknown-linux-musl", entrypoint: "bin/codex", resourcesDir: "codex-resources", pathDir: "codex-path" }));
  const codex = buildFile(path.join(codexVendor, "bin/codex"), "Codex ELF fixture", 0o700);
  const sibling = buildFile(path.join(codexVendor, "bin/codex-code-mode-host"), "Codex sidecar fixture", 0o700);
  const resource = buildFile(path.join(codexVendor, "codex-resources/sample"), "Codex fixture resource");
  const node = buildFile(path.join(images, "node/24.22.1/bin/node"), "global Node ELF fixture", 0o700);
  const projectNode = buildFile(path.join(images, "node/26.11.1/bin/node"), "project Node ELF fixture", 0o700);
  for (const [name, pkg, version] of [
    ["pi", piPackage, "1.5.2"],
    ["codex", codexPackage, "0.171.0"],
  ] as const) {
    buildFile(path.join(home, "tools/user/bins", `${name}.json`), JSON.stringify({ name, package: pkg, version, platform: { node: "24.22.1" } }));
  }
  const shim = buildFile(path.join(bin, "volta-shim"), "shared shim fixture", 0o700);
  for (const name of ["pi", "codex", "node"]) symlinkSync(shim, path.join(bin, name));
  // Resolve relative to the approved cwd and prove that the query receives a small environment.
  const quoted = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  buildFile(
    path.join(bin, "volta"),
    `#!/bin/sh
[ "$1" = which ] && [ -f approved-cwd ] && [ -z "${"$"}{HUHU_PRIVATE_RESOLUTION_FIXTURE+x}" ] || exit 71
case "$2" in
pi) printf '%s\\n' ${quoted(piEntry)} ;;
codex) printf '%s\\n' ${quoted(codexEntry)} ;;
node) printf '%s\\n' ${quoted(projectNode)} ;;
*) exit 72 ;;
esac
`,
    0o700,
  );
  const helper = buildFile(
    path.join(work, "native-probe"),
    '#!/bin/sh\ncase "$1" in\nprogram) result=PROGRAM;;\ndirectory) result=DIRECTORY;;\n*) exit 64;;\nesac\nprintf "HUHU_PTY %s 1 " "$result"\n/usr/bin/stat -c "%d %i 1" "$2"\n',
    0o700,
  );
  return { bin, cwd, piEntry, chunk, theme, codex, codexEntry, codexRoot, sibling, resource, node, projectNode, helper };
}

const argv = ["--model", "name with spaces", "--session", "中文 目录/session (x).jsonl", "$(literal); 'boundary'"];

test.skipIf(!platform)("Volta Pi 区分全局配对与项目 Node，保持 resolver argv 和审批文件", async () => {
  const work = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-linux-program-")));
  try {
    const fixture = installFixture(work);
    const environment = environments(fixture.helper, { SHELL: shell, HUHU_PRIVATE_RESOLUTION_FIXTURE: "ordinary", PI_PACKAGE_DIR: "/ignored" });
    const plan = await environment.prepare(selection, "pi", fixture.cwd, [path.join(fixture.bin, "pi"), ...argv], {});
    assert(plan.kind === "native");
    expect(plan.launch.argv).toEqual([fixture.node, fixture.piEntry, ...argv]);
    expect(plan.launch.files.map(({ path: file }) => file)).toEqual(expect.arrayContaining([fixture.chunk, fixture.theme]));
    expect(plan.launch.ordinary).not.toHaveProperty("PI_PACKAGE_DIR");
    expect(plan.launch.returnShell).toMatchObject({ image: { path: realpathSync.native(shell) }, argv: [shell, "-i"], source: shell });
    expect(plan.launch.directory.path).toBe(fixture.cwd);
    expect(plan.launch.linuxInstallation).toMatchObject({ kind: "pi-node", localModules: expect.stringContaining("pi-coding-agent/node_modules") });

    const direct = environments(fixture.helper, { PATH: path.relative(fixture.cwd, fixture.bin), SHELL: shell });
    const directPlan = await direct.prepare(selection, "pi", fixture.cwd, [fixture.piEntry, ...argv], {});
    assert(directPlan.kind === "native");
    expect(directPlan.launch.argv).toEqual([fixture.projectNode, fixture.piEntry, ...argv]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test.skipIf(!platform)("直接 npm Pi 的解释器、入口和 chunk 替换均使旧批准失效", async () => {
  const work = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-linux-program-")));
  try {
    const fixture = installFixture(work);
    const npmBin = path.join(work, "npm-bin");
    mkdirSync(npmBin);
    const command = path.join(npmBin, "pi");
    symlinkSync(fixture.piEntry, command);
    const engine = environments(fixture.helper, { PATH: path.dirname(fixture.node), SHELL: shell });
    const preview = () => engine.prepare(selection, "pi", fixture.cwd, [command, ...argv], {});
    const first = await preview();
    assert(first.kind === "native");
    expect(first.launch.argv).toEqual([fixture.node, fixture.piEntry, ...argv]);
    let previous = first;
    for (const [file, bytes] of [
      [fixture.node, "updated Node fixture"],
      [fixture.piEntry, "#!/usr/bin/env node\n\n"],
      [fixture.chunk, "export const fixture = false;"],
    ] as const) {
      renameSync(file, file + ".old");
      buildFile(file, bytes, 0o700);
      const next = await preview();
      assert(next.kind === "native");
      expect(next.approval).not.toBe(previous.approval);
      expect(next.launch.argv).toEqual(previous.launch.argv);
      previous = next;
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test.skipIf(!platform)("Volta Codex 固定平台包布局，Claude 原生版本与独立 shell 保留入口语义", async () => {
  const work = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-linux-program-")));
  try {
    const fixture = installFixture(work);
    const engine = environments(fixture.helper, { SHELL: shell, CODEX_MANAGED_BY_BUN: "ignored" });
    const plan = await engine.prepare(selection, "codex", fixture.cwd, [path.join(fixture.bin, "codex"), ...argv], {});
    assert(plan.kind === "native");
    expect(plan.launch.argv).toEqual([fixture.codex, ...argv]);
    expect(plan.launch.files.map(({ path: file }) => file)).toEqual(expect.arrayContaining([fixture.codexEntry, fixture.sibling, fixture.resource]));
    expect(plan.launch.linuxInstallation).toMatchObject({ kind: "codex-npm", root: fixture.codexRoot, packageRoot: fixture.codexRoot });
    expect(plan.launch.ordinary).not.toHaveProperty("CODEX_MANAGED_BY_BUN");
    const claudeImage = buildFile(path.join(work, "claude/versions/2.1.330"), "Claude ELF fixture", 0o700);
    const claudeEntry = path.join(work, "claude/claude");
    symlinkSync(claudeImage, claudeEntry);
    const claude = await engine.prepare(selection, "claude", fixture.cwd, [claudeEntry, ...argv], {});
    assert(claude.kind === "native");
    expect(claude.launch.argv).toEqual([claudeImage, ...argv]);
    expect(claude.launch.linuxInstallation?.kind).toBe("claude-native");
    const standalone = await engine.prepare(selection, "shell", fixture.cwd, undefined, {});
    assert(standalone.kind === "native");
    expect(standalone.launch.argv).toEqual([realpathSync.native(shell), "-l"]);
    expect(standalone.launch.returnShell).toBeUndefined();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

const realHelper = process.env["HUHU_REAL_PROVIDER_HELPER"];
const realProviders = [
  { name: "Volta Codex", provider: "codex", program: process.env["HUHU_REAL_VOLTA_CODEX"], layout: "codex-npm" },
  { name: "Volta Pi", provider: "pi", program: process.env["HUHU_REAL_VOLTA_PI"], layout: "pi-node" },
  { name: "直接 npm Pi", provider: "pi", program: process.env["HUHU_REAL_DIRECT_PI"], layout: "pi-node" },
  { name: "原生 Claude", provider: "claude", program: process.env["HUHU_REAL_CLAUDE"], layout: "claude-native" },
] as const;
const offlinePi = ["--offline", "--no-session", "--no-extensions", "--no-mcp", "--no-skills", "--no-themes", "--no-context-files", "--no-prompt-templates", "--no-approve", "--tui-mode", "regular"];

for (const { name, provider, program, layout } of realProviders) {
  test.skipIf(!platform || !realHelper || !program)(
    `真实 provider ${name} 离线使用批准入口和返回 shell`,
    async () => {
      expect(
        readFileSync("/proc/net/dev", "utf8")
          .split("\n")
          .slice(2)
          .filter(Boolean)
          .map((line) => line.split(":")[0]!.trim()),
      ).toEqual(["lo"]);
      const work = realpathSync.native(mkdtempSync(path.join(tmpdir(), "huhu-real-provider-")));
      try {
        const isolated = Object.fromEntries(
          ["home", "config", "data", "state", "cache", "runtime", "tmp", "工作 区", "codex", "pi", "claude"].map((name) => {
            const dir = path.join(work, name);
            mkdirSync(dir, { mode: 0o700 });
            return [name, dir];
          }),
        );
        const cwd = isolated["工作 区"]!;
        const node = process.env["HUHU_REAL_NODE"];
        if (name === "直接 npm Pi") assert(node && path.isAbsolute(node), "直接 npm Pi 需要明确的测试 Node 绝对路径");
        const ordinary = {
          PATH: [node && path.dirname(node), "/usr/bin", "/bin"].filter(Boolean).join(":"),
          HOME: isolated.home!,
          XDG_CONFIG_HOME: isolated.config!,
          XDG_DATA_HOME: isolated.data!,
          XDG_STATE_HOME: isolated.state!,
          XDG_CACHE_HOME: isolated.cache!,
          XDG_RUNTIME_DIR: isolated.runtime!,
          TMPDIR: isolated.tmp!,
          DBUS_SESSION_BUS_ADDRESS: "unix:path=" + path.join(work, "no-session-bus"),
          DISPLAY: "",
          WAYLAND_DISPLAY: "",
          XAUTHORITY: path.join(work, "no-Xauthority"),
          SHELL: shell,
          TERM: "xterm-256color",
          LANG: "C.UTF-8",
          CODEX_HOME: isolated.codex!,
          PI_CODING_AGENT_DIR: isolated.pi!,
          PI_OFFLINE: "1",
          PI_TELEMETRY: "0",
          CLAUDE_CONFIG_DIR: isolated.claude!,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          DISABLE_AUTOUPDATER: "1",
          HUHU_PROVIDER_FIXTURE_PLAIN: "ordinary",
        };
        const engine = environments(realHelper!, ordinary);
        const python = path.resolve(import.meta.dirname, "../../../native/agent-pty/tests/verify-real-provider.py");
        const defaults = provider === "codex" ? ["--no-daemon"] : provider === "pi" ? offlinePi : [];
        for (const mode of ["version", "interactive"] as const) {
          const settings = emptyAgentSettings();
          settings.agents[provider] = { command: program!, args: mode === "version" ? [...defaults, "--version"] : defaults };
          const resolved = resolveAgentLaunch({ settings, locatedCommand: program! }, { agentId: provider, mode: "interactive" });
          const plan = await engine.prepare(selection, provider, cwd, [resolved.command, ...resolved.argv], resolved.env);
          assert(plan.kind === "native");
          expect(plan.launch.linuxInstallation?.kind).toBe(layout);
          console.info(JSON.stringify({ provider: name, mode, cwd, argv: plan.launch.argv, approval: plan.approval, image: plan.launch.image, declaredFiles: plan.launch.files.length }));
          await new Promise<void>((resolve, reject) => {
            const probe = spawn("/usr/bin/python3", [python, "--helper", plan.helper.path, "--provider", provider, "--mode", mode], {
              env: { ...ordinary, PYTHONDONTWRITEBYTECODE: "1" },
              stdio: ["pipe", "inherit", "inherit"],
              signal: AbortSignal.timeout(90_000),
            });
            probe.stdin.on("error", reject);
            probe.once("error", reject);
            probe.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`offline provider probe exited ${code}`))));
            probe.stdin.end(JSON.stringify(plan.launch));
          });
        }
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    },
    200_000,
  );
}
