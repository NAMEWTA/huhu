// @ts-nocheck — 上游固定源码，按上游的 TS 严格度编写；本仓库只加这一行，不改其余内容（见 UPSTREAM.md）
// HUHU integration guard. Keeps view-only replacements stable during IME input.
// The source buffer remains owned by CodeMirror. Native platform IME QA is still required.
import {StateEffect, StateField} from '@codemirror/state';
export const huhuCompositionEffect = StateEffect.define<boolean>();
export const huhuCompositionField = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) if (effect.is(huhuCompositionEffect)) return effect.value;
    return value;
  },
});
