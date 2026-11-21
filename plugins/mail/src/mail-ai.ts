export const mailAiModes = ["summary", "todos", "reply", "chat"] as const;
export type MailAiMode = (typeof mailAiModes)[number];
export const mailAiModeLabels: Record<MailAiMode, string> = { summary: "总结", todos: "提取待办", reply: "起草回复", chat: "对话" };
export const mailAiExcerptLimit = 16_000;
export const mailAiQuestionLimit = 2_000;
