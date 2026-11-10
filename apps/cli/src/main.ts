import { Command, CommanderError } from "commander";
import { callCapability, render } from "./commands/call.js";
import { ConnectError, connect } from "./connect.js";

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

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (e) {
    if (e instanceof CommanderError) return e.exitCode === 0 ? 0 : 2;
    throw e;
  }
  return code;
}
