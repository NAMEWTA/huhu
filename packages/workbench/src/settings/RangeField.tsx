import { Badge } from "@huhu/ui";
import { useEffect, useState } from "react";

/** 滑块 + 数值徽标（原型 range + Badge）：拖动结束或键盘调整时提交。 */
export function RangeField({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit(n: number): void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="row">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={draft}
        onChange={(e) => {
          setDraft(Number(e.target.value));
          onCommit(Number(e.target.value));
        }}
      />
      <Badge>{draft}px</Badge>
    </div>
  );
}
