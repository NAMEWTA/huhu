import { Command, CommanderError } from "commander";
import { callCapability, render } from "./commands/call.js";
import { ConnectError, connect } from "./connect.js";
import { createMcpServer } from "./mcp.js";

export const VERSION = "0.0.1";

/** 运行 CLI，返回退出码。 */
export async function run(argv: string[], io: { out: (s: string) => void; err: (s: string) => void } = { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") }): Promise<number> {
  const program = new Command();
  program.name("huhu").description("HUHU Workbench 命令行").version(VERSION).exitOverride().configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) });
  let code = 0;

  program
    .command("call <capability>")
    .description("通用能力调用")
    .option("--input-json <json>", "输入 JSON", "{}")
    .option("--vault <path>", "Vault 路径")
    .option("--json", "输出 CapabilityResult JSON")
    .action(async (capability: string, o: { inputJson: string; vault?: string; json?: boolean }) => {
      let input: unknown;
      try {
        input = JSON.parse(o.inputJson);
      } catch {
        io.err("--input-json 不是合法 JSON");
        code = 2;
        return;
      }
      try {
        const conn = await connect(o.vault);
        const r = render(await callCapability(conn, capability, input), o.json === true);
        io.out(r.out);
        code = r.code;
      } catch (e) {
        if (e instanceof ConnectError) {
          io.err(e.message);
          code = e.exitCode;
        } else throw e;
      }
    });

  program
    .command("vault")
    .description("Vault 命令")
    .command("info")
    .option("--vault <path>")
    .option("--json")
    .action(async (o: { vault?: string; json?: boolean }) => {
      try {
        const conn = await connect(o.vault);
        const r = render(await callCapability(conn, "vault.info", {}), o.json === true);
        io.out(r.out);
        code = r.code;
      } catch (e) {
        if (e instanceof ConnectError) {
          io.err(e.message);
          code = e.exitCode;
        } else throw e;
      }
    });

  /** 便捷命令都转为 `call`。 */
  const shortcut = (cmd: Command, capability: string, build: (opts: Record<string, unknown>, args: string[]) => unknown) => {
    cmd.option("--vault <path>", "Vault 路径").option("--json", "输出 CapabilityResult JSON").action(async (...a: unknown[]) => {
      const command = a[a.length - 1] as Command;
      const opts = command.opts() as Record<string, unknown>;
      const args = a.slice(0, -2) as string[];
      try {
        const conn = await connect(opts["vault"] as string | undefined);
        const r = render(await callCapability(conn, capability, build(opts, args)), opts["json"] === true);
        io.out(r.out);
        code = r.code;
      } catch (e) {
        if (e instanceof ConnectError) {
          io.err(e.message);
          code = e.exitCode;
        } else throw e;
      }
    });
  };
  const bool = (v: unknown) => (v === undefined ? undefined : String(v) === "true");
  shortcut(program.command("plugins").description("插件").command("list"), "plugins.list", () => ({}));
  shortcut(program.command("capabilities").description("能力目录").command("list"), "capabilities.list", () => ({}));
  shortcut(program.command("notes").description("笔记").command("list"), "notes.list", () => ({}));
  const tasks = program.command("tasks").description("任务");
  shortcut(tasks.command("list").option("--category <c>", "all|today|tomorrow|week|ended").option("--completed <bool>", "true|false"), "tasks.list", (o) => ({ ...(o["category"] ? { category: o["category"] } : {}), ...(bool(o["completed"]) !== undefined ? { completed: bool(o["completed"]) } : {}) }));
  shortcut(tasks.command("create").requiredOption("--title <t>").option("--due <date>"), "tasks.create", (o) => ({ title: o["title"], ...(o["due"] ? { due: o["due"] } : {}) }));
  tasks.command("complete <id>").option("--vault <path>").option("--json").action(async (id: string, o: { vault?: string; json?: boolean }) => {
    try {
      const conn = await connect(o.vault);
      const cur = await callCapability(conn, "tasks.read", { id });
      const r = cur.ok ? await callCapability(conn, "tasks.setCompleted", { id, completed: true, expectedVersion: (cur.data as { version: string }).version }) : cur;
      const out = render(r, o.json === true);
      io.out(out.out);
      code = out.code;
    } catch (e) {
      if (e instanceof ConnectError) {
        io.err(e.message);
        code = e.exitCode;
      } else throw e;
    }
  });
  shortcut(program.command("inbox").description("收件箱").command("capture").requiredOption("--title <t>").option("--body <text>"), "inbox.capture", (o) => ({ title: o["title"], body: (o["body"] as string | undefined) ?? o["title"] }));

  // stdio MCP：stdout 只输出协议帧，日志写 stderr
  program.command("mcp").description("以 stdio 方式运行 MCP 服务器").option("--vault <path>").action(async (o: { vault?: string }) => {
    try {
      const conn = await connect(o.vault, { role: "mcp" }); // 身份为 mcp，而不是 cli
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      await createMcpServer(conn, VERSION).connect(new StdioServerTransport());
      await new Promise<void>(() => undefined); // 一直运行到 stdin 关闭（进程退出）
    } catch (e) {
      if (e instanceof ConnectError) {
        io.err(e.message);
        code = e.exitCode;
      } else throw e;
    }
  });

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : 2;
    throw e;
  }
  return code;
}
