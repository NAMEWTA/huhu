import type { TaskDto } from "@huhu/contracts";
import { Button, Dialog } from "@huhu/ui";
import { useEngine } from "@huhu/workbench";
import { useId, useRef, useState } from "react";
import type { DispatchInput } from "../engine/dispatch-store.js";

type Context = NonNullable<DispatchInput["context"]>;

function artifactPaths(task: TaskDto, messages: string[]) {
  return [...new Set(task.references.filter(({ kind, exists, from, path }) => kind === "file" && exists && /\.(md|markdown|txt)$/i.test(path) && (from === "task" || messages.includes(from))).map(({ path }) => path))];
}

export function NewTaskRoundDialog({ task, canStart, early, onClose, onStart }: { task: TaskDto; canStart: boolean; early: boolean; onClose(): void; onStart(context: Context): void }) {
  const engine = useEngine();
  const form = useId();
  const description = useRef<HTMLParagraphElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const candidates = artifactPaths(task, messages);
  const comments = task.comments.filter(({ id, body }) => id.trim() && body.trim() && body.length <= 8_000);
  const selectedPaths = paths.filter((path) => candidates.includes(path));

  async function start() {
    if (!canStart || reading) return;
    setReading(true);
    setError("");
    try {
      const artifacts = await Promise.all(
        selectedPaths.map(async (path) => {
          const { version } = await engine.call<{ version: string }>("vault.readFile", { path });
          return { path, expectedVersion: version };
        }),
      );
      onStart({ messageIds: messages, artifacts });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setReading(false);
    }
  }

  return (
    <Dialog
      open
      title="开始新一轮"
      initialFocusRef={description}
      error={error}
      onClose={() => {
        if (!reading) onClose();
      }}
      actions={
        <>
          <Button disabled={reading} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" type="submit" form={form} disabled={!canStart} loading={reading}>
            {early ? "确认提前开始新一轮" : "确认开始新一轮"}
          </Button>
        </>
      }
    >
      <p ref={description} tabIndex={-1}>
        新轮次将使用新会话。原生问题保留原状态。
      </p>
      <form
        id={form}
        className="hu-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void start();
        }}
      >
        {comments.length > 0 ? (
          <fieldset className="tasks-round-options" disabled={reading}>
            <legend>原评论（最多 8 条）</legend>
            {comments.map(({ id, body }) => {
              const checked = messages.includes(id);
              const preview = body.trim().slice(0, 160);
              return (
                <label key={id}>
                  <input
                    type="checkbox"
                    name="messageIds"
                    value={id}
                    checked={checked}
                    disabled={!checked && messages.length >= 8}
                    onChange={(event) => {
                      const next = event.target.checked ? [...messages, id] : messages.filter((messageId) => messageId !== id);
                      const remaining = artifactPaths(task, next);
                      setMessages(next);
                      setPaths((selected) => selected.filter((path) => remaining.includes(path)));
                    }}
                  />
                  <span>
                    {preview}
                    {body.trim().length > preview.length ? "…" : ""}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
        {candidates.length > 0 ? (
          <fieldset className="tasks-round-options" disabled={reading}>
            <legend>原产物（最多 4 项）</legend>
            {candidates.map((path) => {
              const checked = selectedPaths.includes(path);
              return (
                <label key={path}>
                  <input
                    type="checkbox"
                    name="artifacts"
                    value={path}
                    checked={checked}
                    disabled={!checked && selectedPaths.length >= 4}
                    onChange={(event) => {
                      setPaths(event.target.checked ? [...selectedPaths, path] : selectedPaths.filter((selected) => selected !== path));
                    }}
                  />
                  <span>{path}</span>
                </label>
              );
            })}
          </fieldset>
        ) : null}
      </form>
    </Dialog>
  );
}
