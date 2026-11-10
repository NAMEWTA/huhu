import { describe, expect, test } from "vitest";
import { applyChoices, countConflicts, splitLines, splitThreeWay, type Segment } from "../src/engine/conflicts/diff3.js";

const conflicts = (s: Segment[] | null) => (s ?? []).filter((x) => x.kind === "conflict");

describe("三方分段", () => {
  test("只有一侧改动：无冲突，自动采用改动", () => {
    const segs = splitThreeWay("a\nb\nc\n", "a\nB\nc\n", "a\nb\nc\n");
    expect(countConflicts(segs!)).toBe(0);
    expect(applyChoices(segs!, [])).toBe("a\nB\nc\n");
  });
  test("两侧改不同位置：无冲突，两处改动都保留", () => {
    const segs = splitThreeWay("1\n2\n3\n4\n5\n", "1\nO\n3\n4\n5\n", "1\n2\n3\n4\nT\n");
    expect(countConflicts(segs!)).toBe(0);
    expect(applyChoices(segs!, [])).toBe("1\nO\n3\n4\nT\n");
  });
  test("两侧改同一行成不同内容：一个冲突块，可逐块选择", () => {
    const segs = splitThreeWay("a\nX\nc\n", "a\nO\nc\n", "a\nT\nc\n")!;
    expect(conflicts(segs)).toEqual([{ kind: "conflict", base: "X\n", ours: "O\n", theirs: "T\n" }]);
    expect(applyChoices(segs, ["ours"])).toBe("a\nO\nc\n");
    expect(applyChoices(segs, ["theirs"])).toBe("a\nT\nc\n");
    expect(applyChoices(segs, ["both"])).toBe("a\nO\nT\nc\n");
    expect(applyChoices(segs, [{ custom: "手工\n" }])).toBe("a\n手工\nc\n");
  });
  test("两侧做了相同改动：不算冲突", () => {
    expect(countConflicts(splitThreeWay("a\nb\n", "a\nZ\n", "a\nZ\n")!)).toBe(0);
  });
  test("多个冲突块互相独立，选择数量必须一致", () => {
    const segs = splitThreeWay("1\n2\n3\n4\n5\n6\n7\n", "1\nO2\n3\n4\n5\nO6\n7\n", "1\nT2\n3\n4\n5\nT6\n7\n")!;
    expect(countConflicts(segs)).toBe(2);
    expect(applyChoices(segs, ["theirs", "ours"])).toBe("1\nT2\n3\n4\n5\nO6\n7\n");
    expect(() => applyChoices(segs, ["ours"])).toThrow();
    expect(() => applyChoices(segs, ["ours", "ours", "ours"])).toThrow();
  });
  test("相邻位置的不同改动按冲突处理；一侧删除一侧修改也是冲突", () => {
    expect(countConflicts(splitThreeWay("a\nb\nc\n", "a\nB\nc\n", "a\nb\nC\n")!)).toBe(1);
    const segs = splitThreeWay("a\nb\nc\n", "a\nc\n", "a\nB\nc\n")!;
    expect(countConflicts(segs)).toBe(1);
    expect(applyChoices(segs, ["ours"])).toBe("a\nc\n");
  });
  test("字节保真：CRLF、BOM、末尾无换行；正文里本来就有冲突标记样的行", () => {
    const base = "﻿a\r\nb\r\nc";
    const segs = splitThreeWay(base, "﻿a\r\nO\r\nc", "﻿a\r\nT\r\nc")!;
    expect(applyChoices(segs, ["ours"])).toBe("﻿a\r\nO\r\nc");
    expect(applyChoices(segs, ["theirs"])).toBe("﻿a\r\nT\r\nc");
    const marked = "<<<<<<< x\n=======\n>>>>>>> y\n";
    const s2 = splitThreeWay(`${marked}k\n`, `${marked}O\n`, `${marked}T\n`)!;
    expect(countConflicts(s2)).toBe(1);
    expect(applyChoices(s2, ["theirs"])).toBe(`${marked}T\n`);
  });
  test("末尾换行差异：有换行与无换行是不同的行，不被悄悄补齐", () => {
    expect(splitLines("a\nb")).toEqual(["a\n", "b"]);
    const segs = splitThreeWay("a\nb", "a\nb\n", "a\nb")!; // 只有本地补了换行：自动采用，且保持有换行
    expect(countConflicts(segs)).toBe(0);
    expect(applyChoices(segs, [])).toBe("a\nb\n");
    const same = splitThreeWay("a\nb", "a\nb", "a\nb")!;
    expect(applyChoices(same, [])).toBe("a\nb");
  });
  test("对一侧为空的基线（双方新增同名文件）退化为单个冲突块", () => {
    const segs = splitThreeWay("", "O\n", "T\n")!;
    expect(countConflicts(segs)).toBe(1);
  });
  test("超出逐块比较上限返回 null", () => {
    const big = (p: string) => Array.from({ length: 3000 }, (_, i) => `${p}${i}\n`).join("");
    expect(splitThreeWay(big("b"), big("o"), big("t"))).toBeNull();
  });
});
