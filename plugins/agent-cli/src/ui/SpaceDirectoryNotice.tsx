import { Button } from "@huhu/ui";
import { spaceCanLaunch, type Space } from "../shared/space.js";

const instructions = {
  external: "请在此 Vault 中重新选择外部工作目录。",
  legacy: "旧记录无法确认工作目录，请重新选择。",
  missing: "保存的工作目录目前找不到，请重新选择。",
  unsafe: "无法安全访问保存的工作目录，请重新选择。",
};

export function SpaceDirectoryNotice({ space, onBind }: { space: Pick<Space, "root" | "binding">; onBind?: (() => void) | undefined }) {
  if (spaceCanLaunch(space)) return null;
  const detail = space.binding?.status === "needs-binding" ? instructions[space.binding.reason] : "请选择工作目录。";
  return (
    <div>
      <p role="status">目录待绑定。{detail}</p>
      {onBind && (
        <Button type="button" onClick={onBind}>
          选择工作目录
        </Button>
      )}
    </div>
  );
}
