// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { PlainTextEditor, type PlainTextEditorHandle, BOM, detectPlainFormat, diagnoseJson, formatJsonText, isValidUtf8, lineSeparatorFor, restoreBom, stripBom } from "../src/index.js";
import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";

afterEach(cleanup);

const viewOf = (container: HTMLElement) => EditorView.findFromDOM(container.querySelector(".cm-editor") as HTMLElement)!;

describe("plain-text-format（F02：字节保真）", () => {
  test("检测 BOM / 换行 / 末尾换行", () => {
    expect(detectPlainFormat(`${BOM}a\r\nb\r\n`)).toEqual({ bom: true, eol: "crlf", finalNewline: true });
    expect(detectPlainFormat("a\nb")).toEqual({ bom: false, eol: "lf", finalNewline: false });
    expect(detectPlainFormat("a\rb").eol).toBe("cr");
    expect(detectPlainFormat("a\r\nb\nc").eol).toBe("mixed");
    expect(detectPlainFormat("abc").eol).toBe("none");
  });
  test("BOM 往返还原；混合换行不可无损编辑", () => {
    expect(restoreBom(stripBom(`${BOM}x`), true)).toBe(`${BOM}x`);
    expect(lineSeparatorFor("mixed").editable).toBe(false);
    expect(lineSeparatorFor("crlf")).toEqual({ separator: "\r\n", editable: true });
  });
  test("严格 UTF-8：GBK 字节被识别为非法", () => {
    expect(isValidUtf8(new TextEncoder().encode("你好"))).toBe(true);
    expect(isValidUtf8(Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]))).toBe(false); // “你好” 的 GBK 编码
  });
  test("JSON 诊断与显式格式化：无效 JSON 不产生任何文本", () => {
    expect(diagnoseJson('{"a":1}').ok).toBe(true);
    const bad = diagnoseJson('{"a": 1,}');
    expect(bad.ok).toBe(false);
    expect(formatJsonText('{"a": 1,}').ok).toBe(false);
  });
  test("格式化保留 BOM / CRLF / 末尾换行与缩进风格", () => {
    const src = `${BOM}{"a":1,"b":[1,2]}\r\n`;
    const r = formatJsonText(src);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text.startsWith(BOM)).toBe(true);
      expect(r.text.endsWith("}\r\n")).toBe(true);
      expect(r.text).toContain('\r\n  "a": 1');
    }
    const tabbed = formatJsonText('{\n\t"a": 1\n}\n');
    expect(tabbed.ok && tabbed.text).toBe('{\n\t"a": 1\n}\n');
  });

  test("格式化仅调整 token 之间的空白，保留成员顺序、重复键和原始字面值", () => {
    const input = String.raw`{"2":9007199254740993,"1":1e+309,"2":-0,"a":[1E-999,{"s":"  [ , } :  \u0061\t \/ ","\u006b":true},null,false,[],{}]}`;
    const output = [
      "{",
      '  "2": 9007199254740993,',
      '  "1": 1e+309,',
      '  "2": -0,',
      '  "a": [',
      "    1E-999,",
      "    {",
      String.raw`      "s": "  [ , } :  \u0061\t \/ ",`,
      String.raw`      "\u006b": true`,
      "    },",
      "    null,",
      "    false,",
      "    [],",
      "    {}",
      "  ]",
      "}",
    ].join("\r\n");
    expect(formatJsonText(`${BOM}${input}\r\n`)).toEqual({ ok: true, text: `${BOM}${output}\r\n` });
    expect(formatJsonText(" \t-0  ")).toEqual({ ok: true, text: "-0" });
    expect(formatJsonText('{\r "a": 1\r}\r')).toEqual({ ok: true, text: '{\r "a": 1\r}\r' });
  });

  test.each(["01", '{"a":1,}', String.raw`{"a":"\x41"}`, '{"a":1}\r\n\n', "[".repeat(3_000) + "0" + "]".repeat(3_000)])("无法无损格式化时给出原因", (source) => {
    expect(formatJsonText(source)).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("PlainTextEditor", () => {
  test("挂载显示内容；BOM 在显示层隐藏、写回时还原", () => {
    const onChange = vi.fn();
    const { container } = render(<PlainTextEditor documentId="a" value={`${BOM}你好`} language="text" ariaLabel="x" onChange={onChange} />);
    const view = viewOf(container);
    expect(view.state.sliceDoc()).toBe("你好");
    view.dispatch({ changes: { from: 2, insert: "!" } });
    expect(onChange).toHaveBeenLastCalledWith(`${BOM}你好!`);
  });
  test("CRLF 文件：编辑后换行仍是 CRLF", () => {
    const onChange = vi.fn();
    const { container } = render(<PlainTextEditor documentId="a" value={"a\r\nb\r\n"} language="text" ariaLabel="x" onChange={onChange} />);
    const view = viewOf(container);
    expect(view.state.doc.lines).toBe(3);
    view.dispatch({ changes: { from: 1, insert: "X" } });
    expect(onChange).toHaveBeenLastCalledWith("aX\r\nb\r\n");
  });
  test("混合换行 → 只读，无法产生 onChange", () => {
    const onChange = vi.fn();
    const { container } = render(<PlainTextEditor documentId="a" value={"a\r\nb\nc"} language="text" ariaLabel="x" onChange={onChange} />);
    expect(viewOf(container).state.readOnly).toBe(true);
  });
  test("外部 value 变化替换文档且不触发 onChange 回环", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(<PlainTextEditor documentId="a" value="A" language="text" ariaLabel="x" onChange={onChange} />);
    rerender(<PlainTextEditor documentId="a" value="B" language="text" ariaLabel="x" onChange={onChange} />);
    expect(viewOf(container).state.doc.toString()).toBe("B");
    expect(onChange).not.toHaveBeenCalled();
  });
  test("JSON：显式格式化走 handle；无效 JSON 返回错误并保持内容", () => {
    const ref = createRef<PlainTextEditorHandle>();
    const onChange = vi.fn();
    const { container, rerender } = render(<PlainTextEditor ref={ref} documentId="j" value={'{"a":1}'} language="json" ariaLabel="x" onChange={onChange} />);
    const r = ref.current!.formatJson();
    expect(r.ok).toBe(true);
    expect(viewOf(container).state.doc.toString()).toBe('{\n  "a": 1\n}');
    expect(onChange).toHaveBeenLastCalledWith('{\n  "a": 1\n}');
    rerender(<PlainTextEditor ref={ref} documentId="j2" value={'{"a": 1,}'} language="json" ariaLabel="x" onChange={onChange} />);
    const bad = ref.current!.formatJson();
    expect(bad.ok).toBe(false);
    expect(viewOf(container).state.doc.toString()).toBe('{"a": 1,}');
  });

  test("一次撤销恢复格式化前的完整文本，前一笔编辑仍可单独撤销", () => {
    const ref = createRef<PlainTextEditorHandle>();
    const onChange = vi.fn();
    const source = `${BOM}{"n":9007199254740993,"n":-0,"s":"  a  "}\r\n`;
    const { container } = render(<PlainTextEditor ref={ref} documentId="j" value={source} language="json" ariaLabel="x" onChange={onChange} />);
    const view = viewOf(container);
    view.dispatch({ changes: { from: 0, insert: " " }, userEvent: "input.type" });
    expect(ref.current!.formatJson().ok).toBe(true);
    expect(undo(view)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(`${BOM} ${stripBom(source)}`);
    expect(undo(view)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(source);
  });
});
