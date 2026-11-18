// 宿主能力开关（Huhu 新增，非上游文件）：服务端 lint / audit 在 Huhu 里不可用（spec Q2）。
// 宿主（OkRoot）在挂载时调用 setHostLintAvailable(false)；vendor 的 lint / audit 客户端据此不再发请求，
// 而不是发出请求再吃一个 404（OkHost.features 的落点）。上游默认可用，保持其原有行为。
let lintAvailable = true;

export function setHostLintAvailable(available: boolean): void {
  lintAvailable = available;
}

export function isHostLintAvailable(): boolean {
  return lintAvailable;
}
