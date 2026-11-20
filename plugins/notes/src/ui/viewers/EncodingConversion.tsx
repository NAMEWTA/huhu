import { Button } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { legacyTextEncodings, unsupportedEncoding } from "../../shared/text-encoding.js";

export type TextEncodingInfo = { state: "ok" | "binary" | "encoding"; version: string };

export function EncodingConversion({ path, onConverted }: { path: string; onConverted(): void }) {
  const engine = useEngine();
  const probe = useCapability<TextEncodingInfo>("notes.textEncoding", { path });
  const readOnly = useCapability<{ readOnly: boolean }>("vault.info", {}).data?.readOnly !== false;
  const id = useId();
  const [encoding, setEncoding] = useState("");
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState("");
  const info = probe.data;
  async function convert(expectedVersion: string) {
    setConverting(true);
    setError("");
    try {
      await engine.call("notes.convertEncoding", { path, encoding, expectedVersion }, { write: true });
      await probe.refetch();
      onConverted();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      void probe.refetch();
    } finally {
      setConverting(false);
    }
  }
  return (
    <div className="hu-empty-state" data-testid="file-encoding-unsupported">
      <p>{unsupportedEncoding}</p>
      {info?.state === "encoding" && !readOnly ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (encoding && !converting) void convert(info.version);
          }}
        >
          <label htmlFor={id}>原文件编码</label>{" "}
          <select id={id} name="encoding" required value={encoding} disabled={converting} onChange={(event) => setEncoding(event.target.value)}>
            <option value="">选择编码</option>
            {legacyTextEncodings.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>{" "}
          <Button type="submit" variant="primary" disabled={!encoding || converting}>
            转换并保存为 UTF-8
          </Button>
        </form>
      ) : null}
      {info?.state === "ok" ? <Button onClick={onConverted}>重新读取</Button> : null}
      {error || probe.error ? (
        <p role="alert" className="hu-field-error">
          {error || probe.error?.message}
        </p>
      ) : null}
    </div>
  );
}
