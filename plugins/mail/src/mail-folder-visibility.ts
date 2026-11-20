import type { MailFolder } from "./engine/account-definition.js";

const hiddenFolders = new Set(["hidden", "trash", "junk", "spam", "drafts", "draft", "deleted", "deleted items", "deleted messages", "垃圾箱", "垃圾邮件", "草稿", "草稿箱", "已删除"]);
export const mailFolderRole = (value: string) => value.trim().replace(/^\\/, "").toLowerCase();
export const isSelectable = ({ flags }: MailFolder) => !flags.some((flag) => ["\\noselect", "\\nonexistent"].includes(flag.toLowerCase()));

export function isPublicMailFolder(folder: MailFolder) {
  const name = folder.delimiter ? folder.path.split(folder.delimiter).at(-1)! : folder.path;
  return isSelectable(folder) && ![name, folder.name, folder.specialUse ?? "", ...folder.flags].some((value) => hiddenFolders.has(mailFolderRole(value)));
}
