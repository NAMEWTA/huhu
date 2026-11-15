/** Vite 的 `?url` 资源导入（PDF.js worker 在 plugins/notes 里这样引入）。必须是没有 import / export 的脚本文件，通配模块声明才生效。 */
declare module "*?url" {
  const url: string;
  export default url;
}
