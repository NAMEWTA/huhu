// 品牌资源的唯一来源是仓库根目录的 assets/brand；用 new URL 引用，由打包器处理成带哈希的资源（不需要模块声明）
const markMono = new URL("../../../../assets/brand/huhu-mark-mono.svg", import.meta.url).href;
const logoDark = new URL("../../../../assets/brand/huhu-logo-dark.svg", import.meta.url).href;
const logoLight = new URL("../../../../assets/brand/huhu-logo-light.svg", import.meta.url).href;

/** 单色虎虎猫头：深色模式下反相成浅色（用 <img>：file:// 页面里 CSS mask 引用本地图片会因跨源被拒绝，打包后会变成实心色块）。 */
export function BrandMark({ className }: { className: string }) {
  return (
    <span className={className} aria-hidden>
      <img src={markMono} alt="" draggable={false} />
    </span>
  );
}

/** 横版 logo：浅色 / 深色两张都渲染，由 [data-mode] 选择器控制显示哪一张。 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={`shell-brand-logo${className ? ` ${className}` : ""}`} data-testid="brand-logo">
      <img className="shell-brand-logo-light" src={logoLight} alt="HUHU" draggable={false} />
      <img className="shell-brand-logo-dark" src={logoDark} alt="HUHU" draggable={false} />
    </span>
  );
}
