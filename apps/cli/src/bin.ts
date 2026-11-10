import { run } from "./main.js";

run(process.argv.slice(2)).then((c) => process.exit(c), (e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
