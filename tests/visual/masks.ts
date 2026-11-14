import type { Locator, Page } from "@playwright/test";

/**
 * 像素比对的容差与遮罩。计算样式快照是主验证（逐元素逐属性精确比对），像素比对只负责合成层面的差异，所以可以有一点容差：
 * - 固定渲染参数（禁用 GPU、关闭 LCD 抗锯齿与字体 hinting，见 launch.ts）后，对同一份代码重复运行，Chromium 对少数 SVG 图标边缘仍有 ≤ 20 像素的栅格化抖动（实测位置不固定，例如顶栏右侧图标、侧栏底部图标）。
 * - 真实的样式回归（哪怕 1px 的 padding 变化）会移动整块内容，差异在数百像素以上，远超容差。
 */
export const NOISE_PIXELS = 40;

/** 单个屏幕的放宽容差（必须写原因）。 */
export const SCREEN_TOLERANCE: Record<string, { pixels: number; reason: string }> = {
  "settings-agent-access": { pixels: 100, reason: "Vercel 深色下该页长文本的抗锯齿在两次运行间有几十像素抖动（实测 62，计算样式完全一致）" },
  "task-new-dialog": { pixels: 100, reason: "新建任务对话框的遮罩与阴影在 Vercel 主题下有几十像素的栅格化抖动（实测 52，计算样式完全一致）" },
  palette: { pixels: 320, reason: "命令面板背景使用 backdrop-filter 模糊，边缘像素在两次运行间有几十像素的栅格化差异（实测 45～222）；整块内容的真实变化远大于此" },
};

/** 遮罩：每一项必须写原因。由 `visual:noise`（对同一份代码连续比对）的结果产生；目前没有需要遮罩的区域。 */
export const MASKS: { reason: string; locate(page: Page): Locator }[] = [
  { reason: "Vault 标识由引擎在首次打开时随机生成（设置·当前 Vault）", locate: (p) => p.getByText(/vault-[a-z0-9]{8,}/) },
  { reason: "Space 配置文件名里有随机 id（设置·数据与存储）", locate: (p) => p.getByText(/space-[a-z0-9]{8,}\.json/) },
];
