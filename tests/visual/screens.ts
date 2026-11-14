import { expect, type Page } from "@playwright/test";

/** 一个“屏幕”：进入方式写成数据。新增界面时在这里加一行，等价性检查自动覆盖。`leave` 用来关闭对话框、面板等临时层。 */
export interface Screen {
  id: string;
  enter(page: Page): Promise<void>;
  leave?(page: Page): Promise<void>;
}

const rail = (name: string) => async (page: Page) => {
  const b = page.getByRole("button", { name, exact: true }).first();
  if ((await b.getAttribute("aria-current")) !== "page") await b.click();
  await page.waitForTimeout(400);
};
const esc = async (page: Page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
};
const settingsPage = (id: string) => async (page: Page) => {
  await rail("设置")(page);
  await page.getByTestId(`settings-nav-${id}`).click();
  await page.waitForTimeout(300);
};

const MODULES = ["工作台", "任务", "知识库", "收件箱", "保险箱", "自动化", "版本历史", "远程连接", "Agent CLI", "健康中心", "能力网关", "插件中心", "设置"];

export const SCREENS: Screen[] = [
  ...MODULES.map((m) => ({ id: `m-${m}`, enter: rail(m) })),
  {
    id: "tasks-list",
    enter: async (p) => {
      await rail("任务")(p);
      await p.getByTestId("task-views").getByRole("tab", { name: "列表" }).click();
    },
  },
  {
    id: "tasks-board",
    enter: async (p) => {
      await rail("任务")(p);
      await p.getByTestId("task-views").getByRole("tab", { name: "看板" }).click();
    },
  },
  {
    id: "tasks-calendar",
    enter: async (p) => {
      await rail("任务")(p);
      await p.getByTestId("task-views").getByRole("tab", { name: "月历" }).click();
    },
  },
  {
    id: "task-detail",
    enter: async (p) => {
      await rail("任务")(p);
      await p.getByTestId("task-views").getByRole("tab", { name: "列表" }).click();
      await p.getByTestId("task-row").filter({ hasText: "整理本周计划" }).click();
      await expect(p.getByTestId("task-detail")).toBeVisible();
    },
    leave: esc,
  },
  {
    id: "task-new-dialog",
    enter: async (p) => {
      await rail("任务")(p);
      await p.getByTestId("task-new").click();
      await p.waitForTimeout(400);
    },
    leave: esc,
  },
  {
    id: "note-editor",
    enter: async (p) => {
      await rail("知识库")(p);
      await p.getByTestId("note-item").filter({ hasText: "示例笔记" }).first().click();
      await expect(p.getByTestId("markdown-editor")).toBeVisible();
    },
  },
  {
    id: "note-reading",
    enter: async (p) => {
      await rail("知识库")(p);
      await p.getByTestId("note-item").filter({ hasText: "示例笔记" }).first().click();
      await p.getByRole("tab", { name: "阅读" }).click();
      await p.waitForTimeout(400);
    },
  },
  {
    id: "archives-categories",
    enter: async (p) => {
      await rail("知识库")(p);
      await p.getByTestId("notes-open-archives").click();
      await expect(p.getByTestId("archive-category-card").first()).toBeVisible();
    },
  },
  {
    id: "archives-type",
    enter: async (p) => {
      await rail("知识库")(p);
      await p.getByTestId("notes-open-archives").click();
      await p.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
      await expect(p.getByTestId("archive-row").first()).toBeVisible();
    },
  },
  {
    id: "archives-detail",
    enter: async (p) => {
      await rail("知识库")(p);
      await p.getByTestId("notes-open-archives").click();
      await p.getByTestId("archive-category-card").filter({ hasText: "通讯录" }).click();
      await p.getByTestId("archive-row").filter({ hasText: "张三" }).click();
      await expect(p.getByTestId("archive-fields")).toBeVisible();
    },
  },
  {
    id: "palette",
    enter: async (p) => {
      await rail("工作台")(p);
      await p.keyboard.press("ControlOrMeta+k");
      await p.getByRole("combobox", { name: "搜索模块、命令和内容" }).fill("任务");
      await expect(p.getByTestId("palette-item").first()).toBeVisible();
    },
    leave: esc,
  },
  ...["appearance", "agent-access", "data", "date-time", "editor", "shortcuts", "vault", "versioning", "about"].map((id) => ({ id: `settings-${id}`, enter: settingsPage(id) })),
];

export const THEMES = ["claude", "apple", "notion", "vercel"] as const;
export const MODES = ["light", "dark"] as const;
