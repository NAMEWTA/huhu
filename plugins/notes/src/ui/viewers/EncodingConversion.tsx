import { Button } from "@huhu/ui";
import { useCapability, useEngine } from "@huhu/workbench";
import { useId, useState } from "react";
import { unsupportedEncoding, type LegacyTextEncoding } from "../../shared/text-encoding.js";

export type TextEncodingInfo = { state: "ok" | "binary" | "encoding"; encodings: LegacyTextEncoding[]; version: string };
type Preview = { text: string; truncated: boolean; version: string; encoding: string };

export function EncodingConversion({ path, onConverted, onConversionError }: { path: string; onConverted(): void; onConversionError?(message: string): void }) {
  const engine = useEngine();
  const probe = useCapability<TextEncodingInfo>("notes.textEncoding", { path });
  const readOnly = useCapability<{ readOnly: boolean }>("vault.info", {}).data?.readOnly !== false;
  const id = useId();
  const [encoding, setEncoding] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const info = probe.data;
  const ready = preview && preview.encoding === encoding && preview.version === info?.version ? preview : null;

  async function showPreview(expectedVersion: string) {
    setPending(true);
    setError("");
    setPreview(null);
    try {
      const result = await engine.call<Pick<Preview, "text" | "truncated">>("notes.previewEncoding", { path, encoding, expectedVersion });
      setPreview({ ...result, encoding, version: expectedVersion });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      void probe.refetch();
    } finally {
      setPending(false);
    }
  }

  async function convert(confirmed: Preview) {
    setPending(true);
    setError("");
    setPreview(null);
    try {
      await engine.call("notes.convertEncoding", { path, encoding: confirmed.encoding, expectedVersion: confirmed.version }, { write: true });
      await probe.refetch();
      onConverted();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(message);
      onConversionError?.(message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="hu-empty-state" data-testid="file-encoding-unsupported">
      <p>{unsupportedEncoding}</p>
      {info && info.encodings.length > 0 ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (encoding && !pending) void showPreview(info.version);
            }}
          >
            <div>
              <label htmlFor={id}>原文件编码</label>
            </div>
            <select
              id={id}
              name="encoding"
              required
              value={encoding}
              disabled={pending}
              onChange={(event) => {
                setEncoding(event.target.value);
                setPreview(null);
                setError("");
              }}
            >
              <option value="">选择编码</option>
              {info.encodings.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>{" "}
            <Button type="submit" disabled={!encoding || pending}>
              预览解码
            </Button>
          </form>
          {ready ? (
            <>
              <p role="status">{ready.truncated ? "解码预览（前 4000 个字符）" : "解码预览"}</p>
              <pre data-testid="file-encoding-preview" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "30vh", overflow: "auto" }}>
                {ready.text}
              </pre>
              {readOnly ? null : (
                <Button type="button" variant="primary" disabled={pending} onClick={() => void convert(ready)}>
                  转换并保存为 UTF-8
                </Button>
              )}
            </>
          ) : null}
        </>
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
