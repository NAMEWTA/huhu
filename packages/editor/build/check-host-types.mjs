import { resolve } from "node:path";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const config = resolve(root, "tsconfig.host.json");
const { config: settings, error } = ts.readConfigFile(config, ts.sys.readFile);
const parsed = error ? null : ts.parseJsonConfigFileContent(settings, ts.sys, root, undefined, config);
const diagnostics = error ? [error] : [...parsed.errors];
if (parsed && diagnostics.length === 0) {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  // The separate vendor program checks upstream files under their own compiler
  // settings. Imported source still supplies its actual types to strict host callers.
  diagnostics.push(...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics());
  for (const name of parsed.fileNames) {
    const file = program.getSourceFile(name);
    if (!file) throw new Error(`宿主类型检查缺少 ${name}`);
    diagnostics.push(...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file));
  }
}
if (diagnostics.length) {
  process.stderr.write(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (name) => name,
      getNewLine: () => ts.sys.newLine,
    }),
  );
  process.exitCode = 1;
}
