// OkHost：宿主（Huhu）向 vendor 暴露的能力清单与回调（design §4）。
// features 里关闭的项，vendor UI 入口不渲染 / 返回 NOT_AVAILABLE；没有等价物的项目不留空按钮。
export interface OkHostFeatures {
  /** lint / audit 服务端能力（Q2：不接） */
  lint: false
  share: false
  presence: false
  history: false
  openWithAi: false
  /** 外链预览：默认关闭（Q3） */
  linkPreview: boolean
}

export interface OkHost {
  features: OkHostFeatures
  /** 打开外部链接（经 Huhu 桌面桥） */
  openExternal(url: string): void | Promise<void>
}

export const DEFAULT_FEATURES: OkHostFeatures = {
  lint: false,
  share: false,
  presence: false,
  history: false,
  openWithAi: false,
  linkPreview: false,
}
