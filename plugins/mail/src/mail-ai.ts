export const mailAiModes = ["summary", "todos", "reply", "chat"] as const;
export type MailAiMode = (typeof mailAiModes)[number];
export const mailAiExcerptLimit = 16_000;
export const mailAiQuestionLimit = 2_000;
