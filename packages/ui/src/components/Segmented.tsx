import type { LucideIcon } from "lucide-react";
import { ChoiceSegmented } from "../proto/controls.js";

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  onChange(v: T): void;
  testId?: string;
  className?: string;
}

/** 分段控件：原型的 ChoiceSegmented（滑动指示条 + Radix 漫游焦点）的类型化封装，选项用 value 而不是 id。 */
export function Segmented<T extends string>({ label, value, options, onChange, testId, className = "" }: SegmentedProps<T>) {
  const control = <ChoiceSegmented label={label} className={className} value={value} items={options.map((o) => ({ id: o.value, label: o.label, ...(o.icon ? { icon: o.icon } : {}) }))} onChange={(id) => onChange(id as T)} />;
  return testId ? (
    <span data-testid={testId} style={{ display: "contents" }}>
      {control}
    </span>
  ) : (
    control
  );
}
