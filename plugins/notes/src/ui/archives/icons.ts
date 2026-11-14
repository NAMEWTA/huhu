import { BookOpen, Briefcase, Building2, Contact, Database, Folder, GraduationCap, Home, Lightbulb, Package, Star, Users, type LucideIcon } from "lucide-react";

/** 类型可选的图标（lucide 名称 → 组件）；不在表里的名称回退到文件夹。 */
export const ARCHIVE_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  users: Users,
  contact: Contact,
  book: BookOpen,
  briefcase: Briefcase,
  building: Building2,
  home: Home,
  school: GraduationCap,
  idea: Lightbulb,
  package: Package,
  star: Star,
  database: Database,
};
export const archiveIcon = (name: string): LucideIcon => ARCHIVE_ICONS[name] ?? Folder;
