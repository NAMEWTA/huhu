import { useCapability } from "@huhu/workbench";
import { ArrowRight } from "lucide-react";

/** 首页卡片：Vault 的 Git 状态（分支与未提交改动数）；没装 Git / 还不是仓库时给一句说明。 */
export function VersioningHomeWidget({ onNavigate }: { onNavigate(moduleId: string): void }) {
  const git = useCapability<{ isRepo: boolean; installed: boolean; branch: string | null; files: unknown[] }>("git.status", {});
  const d = git.data;
  return (
    <>
      <div className="hu-mini-empty" data-testid="home-git-status">
        {!d ? "…" : !d.installed ? "本机没有安装 Git" : !d.isRepo ? "这个 Vault 还没有启用 Git 同步" : `分支 ${d.branch ?? "（分离）"} · ${d.files.length === 0 ? "没有未提交的改动" : `${d.files.length} 个文件有改动`}`}
      </div>
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("versioning")}>
        版本与同步 <ArrowRight size={14} aria-hidden />
      </button>
    </>
  );
}
