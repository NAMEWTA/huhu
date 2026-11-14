import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";

export interface ReferenceCandidate {
  /** Vault 相对路径；文件夹以 / 结尾。 */
  path: string;
  kind: "file" | "folder";
  label?: string;
}

/**
 * `@` 引用补全：输入 `@` 后弹出 Vault 文件和文件夹的模糊匹配，选中后插入 `[[相对路径]]`
 * （文件写完整相对路径含扩展名，文件夹以 `/` 结尾）。候选与打分由宿主提供（数据源 vault.tree，打分复用命令面板的 scoreText）。
 */
export function referenceCompletion(search: (query: string) => readonly ReferenceCandidate[]): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/@[^\s[\]]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    const query = word.text.slice(1);
    const options: Completion[] = search(query).map((c) => ({
      label: c.path,
      detail: c.kind === "folder" ? "文件夹" : "文件",
      type: c.kind === "folder" ? "namespace" : "text",
      apply: (view, _completion, from, to) => {
        const insert = `[[${c.path}]]`;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
      },
    }));
    return { from: word.from, options, filter: false };
  };
  return autocompletion({ override: [source], activateOnTyping: true, icons: false, defaultKeymap: true });
}
