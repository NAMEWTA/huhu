import { Command, CommanderError, Option } from "commander";
import { callCapability, discoverCapabilities, readCallFile, readCapabilityOperation, render } from "./commands/call.js";
import { ConnectError, connect, type Connection } from "./connect.js";
import { CapabilityIntentKeySchema, CapabilityOperationLookupSchema, errors, type CapabilityResult } from "@huhu/contracts";
import { buildGuideFiles, guideManual } from "@huhu/plugin-agent-guide/shared";

export const VERSION = "0.0.2-rc.1";

/** 运行 CLI，返回退出码。 */
export async function run(argv: string[], io: { out: (s: string) => void; err: (s: string) => void } = { out: (s) => process.stdout.write(s + "\n"), err: (s) => process.stderr.write(s + "\n") }): Promise<number> {
  // `--skill`：输出随包手册，不需要选定 Vault，也不连接 Engine
  if (argv[0] === "--skill") {
    io.out(guideManual(buildGuideFiles(VERSION, [])));
    return 0;
  }
  const program = new Command();
  program
    .name("huhu")
    .description("HUHU Workbench 命令行")
    .version(VERSION)
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) });
  let code = 0;

  program
    .command("call <capability>")
    .description("通用能力调用")
    .option("--input-json <json>", "输入 JSON", "{}")
    .addOption(new Option("--input-file <path>", "从 UTF-8 文件读取 JSON，- 表示标准输入（与 --input-json 互斥）").conflicts("inputJson"))
    .option("--vault <path>", "Vault 路径")
    .option("--intent-key <key>", "在支持的能力中用原意图键提交或重试")
    .option("--json", "输出 CapabilityResult JSON")
    .action(async (capability: string, o: { inputJson: string; inputFile?: string; vault?: string; json?: boolean; intentKey?: string }) => {
      let text = o.inputJson;
      if (o.inputFile !== undefined) {
        const file = await readCallFile(o.inputFile);
        if ("error" in file) {
          io.err(file.error);
          code = 2;
          return;
        }
        text = file.text;
      }
      let input: unknown;
      try {
        input = JSON.parse(text);
      } catch {
        io.err(`${o.inputFile === undefined ? "--input-json" : "--input-file"} 不是合法 JSON`);
        code = 2;
        return;
      }
      const intent = CapabilityIntentKeySchema.optional().safeParse(o.intentKey);
      if (!intent.success) {
        const r = render({ ok: false, error: errors.invalidInput("执行意图键不符合要求").toJSON() }, o.json === true);
        io.out(r.out);
        code = r.code;
        return;
      }
      try {
        const conn = await connect(o.vault);
        const r = render(await callCapability(conn, capability, input, intent.data), o.json === true);
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
    .command("operation [operationId]")
    .description("查询本入口提交的持久操作")
    .option("--capability <name>", "原能力名")
    .option("--intent-key <key>", "原意图键")
    .option("--vault <path>", "Vault 路径")
    .option("--json", "输出 CapabilityResult JSON")
    .action(async (operationId: string | undefined, o: { capability?: string; intentKey?: string; vault?: string; json?: boolean }) => {
      const lookup = CapabilityOperationLookupSchema.safeParse({ ...(operationId && { operationId }), ...(o.capability && { capability: o.capability }), ...(o.intentKey && { intentKey: o.intentKey }) });
      try {
        const result = lookup.success ? await readCapabilityOperation(await connect(o.vault), lookup.data) : { ok: false as const, error: errors.invalidInput("传入操作标识，或一起传入能力名和原意图键").toJSON() };
        const shown = render(result, o.json === true);
        io.out(shown.out);
        code = shown.code;
      } catch (error) {
        if (!(error instanceof ConnectError)) throw error;
        io.err(error.message);
        code = error.exitCode;
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

  const shortcut = (cmd: Command, capability: string | ((conn: Connection) => Promise<CapabilityResult<unknown>>), build: (opts: Record<string, unknown>, args: string[]) => unknown = () => ({})) => {
    cmd
      .option("--vault <path>", "Vault 路径")
      .option("--json", "输出 CapabilityResult JSON")
      .action(async (...a: unknown[]) => {
        const command = a[a.length - 1] as Command;
        const opts = command.opts() as Record<string, unknown>;
        const args = a.slice(0, -2) as string[];
        try {
          const conn = await connect(opts["vault"] as string | undefined);
          const result = typeof capability === "string" ? await callCapability(conn, capability, build(opts, args)) : await capability(conn);
          const r = render(result, opts["json"] === true);
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
  shortcut(program.command("guide").description("Agent 指南").command("status"), "guide.status", () => ({}));
  shortcut(program.command("plugins").description("插件").command("list"), "plugins.list", () => ({}));
  shortcut(program.command("capabilities").description("能力发现").command("list"), discoverCapabilities);
  shortcut(program.command("notes").description("笔记").command("list"), "notes.list", () => ({}));
  const tasks = program.command("tasks").description("任务");
  shortcut(
    tasks
      .command("list")
      .option("--category <c>", "all|today|tomorrow|week|ended")
      .option("--status <s>", "not_started|in_progress|completed（可用逗号分隔多个）")
      .option("--type <t>", "human|agent")
      .option("--tag <tags>", "标签，逗号分隔，全部匹配"),
    "tasks.list",
    (o) => ({
      ...(o["category"] ? { category: o["category"] } : {}),
      ...(o["status"]
        ? {
            status: String(o["status"])
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          }
        : {}),
      ...(o["type"] ? { type: o["type"] } : {}),
      ...(o["tag"]
        ? {
            tags: String(o["tag"])
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean),
          }
        : {}),
    }),
  );
  shortcut(tasks.command("create").requiredOption("--title <t>").option("--due <date>"), "tasks.create", (o) => ({ title: o["title"], ...(o["due"] ? { due: o["due"] } : {}) }));
  tasks
    .command("status <id> <status>")
    .description("修改任务状态：not_started | in_progress | completed")
    .option("--vault <path>")
    .option("--json")
    .action(async (id: string, status: string, o: { vault?: string; json?: boolean }) => {
      try {
        const conn = await connect(o.vault);
        const cur = await callCapability(conn, "tasks.read", { id });
        const r = cur.ok ? await callCapability(conn, "tasks.setStatus", { id, status, expectedVersion: (cur.data as { version: string }).version }) : cur;
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

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : 2;
    throw e;
  }
  return code;
}
