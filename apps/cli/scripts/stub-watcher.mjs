// CLI 不监听文件；Vault 包会顶层引入 @parcel/watcher（原生模块，无法随单文件 cli.mjs 分发），这里用桩替换，真正使用时才报错。
const unavailable = () => { throw new Error("文件监听在 CLI 中不可用"); };
export const subscribe = unavailable;
export const getEventsSince = unavailable;
export const writeSnapshot = unavailable;
export default { subscribe, getEventsSince, writeSnapshot };
