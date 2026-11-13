import { useEffect } from "react";
import { useEngine } from "../engine-client/react.js";
import { registerFlusher } from "../state/flushers.js";

/** 关闭窗口 / 退出前暂停专注计时并保存剩余时间（modules/workbench.md）：随外壳常驻，不依赖首页卡片是否打开。 */
export function FocusPauseOnClose() {
  const engine = useEngine();
  useEffect(
    () =>
      registerFlusher(async () => {
        const v = await engine.call<{ running: boolean }>("home.focus.get", {});
        if (v.running) await engine.call("home.focus.update", { action: "pause" }, { write: true });
      }),
    [engine],
  );
  return null;
}
