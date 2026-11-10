export type NoteTemplate = "blank" | "meeting" | "project" | "daily";

/** 模板正文，取自原型 knowledge.jsx。 */
export function renderTemplate(template: NoteTemplate, title: string): string {
  switch (template) {
    case "blank":
      return `# ${title}\n\n`;
    case "meeting":
      return `# ${title}\n\n## 参会者\n\n## 讨论记录\n\n## 行动项\n\n- [ ] \n`;
    case "project":
      return `# ${title}\n\n## 目标\n\n## 范围\n\n## 里程碑\n\n- [ ] 第一阶段\n\n## 相关资料\n`;
    case "daily":
      return `# ${title}\n\n## 今天最重要的事\n\n- [ ] \n\n## 随手记录\n\n## 晚间回顾\n`;
  }
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** 文件/文件夹名称校验；通过返回 null，否则返回面向用户的错误文案。 */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return "名称不能为空";
  if (/[\\/:*?"<>|]/.test(n)) return "名称不能包含 / \\ : * ? \" < > |";
  if (n === "." || n === ".." || /[. ]$/.test(n)) return "名称不能以点或空格结尾";
  if (RESERVED.test(n.replace(/\.[^.]*$/, ""))) return "这是系统保留名称";
  if ([...n].some((c) => c.charCodeAt(0) < 32)) return "名称包含不可见字符";
  return null;
}
